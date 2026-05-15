import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

type Operation = "create_contact" | "update_stage" | "log_interaction"

interface ContactData {
  name?: string
  phone?: string
  email?: string
  lead_source?: string
  pipeline_stage?: string
  score?: number
  notes?: string
}

interface CrmWriteRequest {
  agent_id: string
  operation: Operation
  contact: ContactData
}

// Stage key → display name (used by GHL path)
const STAGE_NAMES: Record<string, string> = {
  new_lead: "New Lead",
  qualified: "Qualified",
  showing_scheduled: "Showing Scheduled",
  showing_complete: "Showing Complete",
  active_buyer: "Active Buyer/Seller",
  under_contract: "Under Contract",
  closed: "Closed",
  crm_followup: "Qualified",
  drip: "New Lead"
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = (fullName || "").trim().split(/\s+/)
  if (parts.length === 1) return { firstName: parts[0] || "Unknown", lastName: "" }
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") }
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } })

// ── HubSpot helpers ──────────────────────────────────────────────────────────

async function hsFind(phone: string, headers: Record<string, string>): Promise<string | null> {
  const res = await fetch("https://api.maton.ai/hubspot/crm/v3/objects/contacts/search", {
    method: "POST", headers,
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: "phone", operator: "EQ", value: phone }] }],
      properties: ["firstname", "lastname", "email", "phone"],
      limit: 1
    })
  })
  if (!res.ok) return null
  return (await res.json())?.results?.[0]?.id ?? null
}

async function hsNote(contactId: string, body: string, headers: Record<string, string>): Promise<void> {
  const noteRes = await fetch("https://api.maton.ai/hubspot/crm/v3/objects/notes", {
    method: "POST", headers,
    body: JSON.stringify({
      properties: { hs_note_body: body, hs_timestamp: Date.now().toString() }
    })
  })
  if (!noteRes.ok) return
  const noteData = await noteRes.json()
  if (noteData.id) {
    await fetch(
      `https://api.maton.ai/hubspot/crm/v3/objects/notes/${noteData.id}/associations/contacts/${contactId}/note_to_contact`,
      { method: "PUT", headers }
    )
  }
}

// ── GHL helpers ──────────────────────────────────────────────────────────────

async function ghlFind(phone: string, locationId: string, h: Record<string, string>): Promise<string | null> {
  const res = await fetch(
    `https://api.maton.ai/highlevel-pit/contacts/?locationId=${locationId}&query=${encodeURIComponent(phone)}&limit=1`,
    { headers: h }
  )
  if (!res.ok) return null
  return (await res.json())?.contacts?.[0]?.id ?? null
}

async function ghlStageId(name: string, pipelineId: string, locationId: string, h: Record<string, string>): Promise<string | null> {
  const res = await fetch(`https://api.maton.ai/highlevel-pit/opportunities/pipelines?locationId=${locationId}`, { headers: h })
  if (!res.ok) return null
  const data = await res.json()
  const pipeline = data?.pipelines?.find((p: { id: string }) => p.id === pipelineId) ?? data?.pipelines?.[0]
  return pipeline?.stages?.find((s: { name: string; id: string }) => s.name.toLowerCase() === name.toLowerCase())?.id ?? null
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  let body: CrmWriteRequest
  try { body = await req.json() }
  catch { return json({ error: "Invalid JSON" }, 400) }

  const { agent_id, operation, contact } = body
  if (!agent_id || !operation) return json({ error: "Missing required fields: agent_id, operation" }, 400)

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("hubspot_connection_id, ghl_connection_id, ghl_location_id, ghl_pipeline_id")
    .eq("agent_id", agent_id)
    .single()

  if (clientError || !client) return json({ error: "agent_id not found" }, 404)

  const matonKey = Deno.env.get("MATON_API_KEY")!
  const useHubSpot = !!client.hubspot_connection_id

  // ── HubSpot path ─────────────────────────────────────────────────────────
  if (useHubSpot) {
    const h = {
      "Authorization": `Bearer ${matonKey}`,
      "Maton-Connection": client.hubspot_connection_id,
      "Content-Type": "application/json"
    }

    if (operation === "create_contact") {
      let contactId = contact.phone ? await hsFind(contact.phone, h) : null
      if (!contactId) {
        const { firstName, lastName } = splitName(contact.name || "")
        const createRes = await fetch("https://api.maton.ai/hubspot/crm/v3/objects/contacts", {
          method: "POST", headers: h,
          body: JSON.stringify({
            properties: {
              firstname: firstName, lastname: lastName,
              email: contact.email || "",
              phone: contact.phone || "",
              real_estate_stage: contact.pipeline_stage || "new_lead",
              hs_lead_status: "NEW"
            }
          })
        })
        if (!createRes.ok) return json({ error: "Failed to create contact", detail: await createRes.text() }, 502)
        contactId = (await createRes.json()).id
      } else {
        // Update stage on existing contact
        await fetch(`https://api.maton.ai/hubspot/crm/v3/objects/contacts/${contactId}`, {
          method: "PATCH", headers: h,
          body: JSON.stringify({ properties: { real_estate_stage: contact.pipeline_stage || "new_lead" } })
        })
      }
      if (contact.notes && contactId) await hsNote(contactId, contact.notes, h)
      return json({ success: true, contact_id: contactId })
    }

    if (operation === "update_stage") {
      if (!contact.phone) return json({ error: "contact.phone required for update_stage" }, 400)
      const contactId = await hsFind(contact.phone, h)
      if (!contactId) return json({ error: "Contact not found" }, 404)
      await fetch(`https://api.maton.ai/hubspot/crm/v3/objects/contacts/${contactId}`, {
        method: "PATCH", headers: h,
        body: JSON.stringify({ properties: { real_estate_stage: contact.pipeline_stage || "new_lead" } })
      })
      if (contact.notes) await hsNote(contactId, contact.notes, h)
      return json({ success: true })
    }

    if (operation === "log_interaction") {
      if (!contact.phone) return json({ error: "contact.phone required" }, 400)
      if (!contact.notes) return json({ error: "contact.notes required" }, 400)
      const contactId = await hsFind(contact.phone, h)
      if (!contactId) return json({ error: "Contact not found" }, 404)
      await hsNote(contactId, contact.notes, h)
      return json({ success: true })
    }
  }

  // ── GHL path ──────────────────────────────────────────────────────────────
  if (!client.ghl_connection_id) return json({ error: "No CRM configured (set hubspot_connection_id or ghl_connection_id)" }, 503)

  const locationId = client.ghl_location_id
  const pipelineId = client.ghl_pipeline_id
  if (!locationId) return json({ error: "GHL location ID not configured" }, 503)

  const h: Record<string, string> = {
    "Authorization": `Bearer ${matonKey}`,
    "Maton-Connection": client.ghl_connection_id,
    "Content-Type": "application/json"
  }

  if (operation === "create_contact") {
    let contactId: string | null = contact.phone ? await ghlFind(contact.phone, locationId, h) : null
    if (!contactId) {
      const { firstName, lastName } = splitName(contact.name || "")
      const res = await fetch("https://api.maton.ai/highlevel-pit/contacts/", {
        method: "POST", headers: h,
        body: JSON.stringify({ locationId, firstName, lastName, email: contact.email || "", phone: contact.phone || "", tags: [contact.lead_source || "unknown", `score-${contact.score ?? 0}`] })
      })
      if (!res.ok) return json({ error: "Failed to create contact", detail: await res.text() }, 502)
      contactId = (await res.json()).contact?.id
    }
    let opportunityId: string | null = null
    if (pipelineId && contactId) {
      const stageId = await ghlStageId(STAGE_NAMES[contact.pipeline_stage || "new_lead"] || "New Lead", pipelineId, locationId, h)
      if (stageId) {
        const oppRes = await fetch("https://api.maton.ai/highlevel-pit/opportunities/", {
          method: "POST", headers: h,
          body: JSON.stringify({ locationId, pipelineId, pipelineStageId: stageId, name: `${contact.name || "Lead"} — ${contact.lead_source || "unknown"}`, status: "open", contactId })
        })
        if (oppRes.ok) opportunityId = (await oppRes.json()).opportunity?.id ?? null
      }
    }
    if (contact.notes && contactId) {
      await fetch(`https://api.maton.ai/highlevel-pit/contacts/${contactId}/notes`, { method: "POST", headers: h, body: JSON.stringify({ body: contact.notes }) })
    }
    return json({ success: true, contact_id: contactId, opportunity_id: opportunityId })
  }

  if (operation === "update_stage") {
    if (!contact.phone) return json({ error: "contact.phone required" }, 400)
    const contactId = await ghlFind(contact.phone, locationId, h)
    if (!contactId) return json({ error: "Contact not found" }, 404)
    const oppSearchRes = await fetch(`https://api.maton.ai/highlevel-pit/opportunities/search?location_id=${locationId}&contact_id=${contactId}&limit=1`, { headers: h })
    if (!oppSearchRes.ok) return json({ error: "Failed to search opportunities" }, 502)
    const opp = (await oppSearchRes.json())?.opportunities?.[0]
    if (!opp) return json({ error: "No opportunity found" }, 404)
    const stageId = await ghlStageId(STAGE_NAMES[contact.pipeline_stage || "new_lead"] || "New Lead", opp.pipelineId, locationId, h)
    await fetch(`https://api.maton.ai/highlevel-pit/opportunities/${opp.id}`, { method: "PUT", headers: h, body: JSON.stringify({ pipelineId: opp.pipelineId, pipelineStageId: stageId, status: opp.status || "open" }) })
    if (contact.notes) await fetch(`https://api.maton.ai/highlevel-pit/contacts/${contactId}/notes`, { method: "POST", headers: h, body: JSON.stringify({ body: contact.notes }) })
    return json({ success: true })
  }

  if (operation === "log_interaction") {
    if (!contact.phone) return json({ error: "contact.phone required" }, 400)
    if (!contact.notes) return json({ error: "contact.notes required" }, 400)
    const contactId = await ghlFind(contact.phone, locationId, h)
    if (!contactId) return json({ error: "Contact not found" }, 404)
    const noteRes = await fetch(`https://api.maton.ai/highlevel-pit/contacts/${contactId}/notes`, { method: "POST", headers: h, body: JSON.stringify({ body: contact.notes }) })
    if (!noteRes.ok) return json({ error: "Failed to create note" }, 502)
    return json({ success: true, note_id: (await noteRes.json()).note?.id })
  }

  return json({ error: `Unknown operation: ${operation}` }, 400)
})
