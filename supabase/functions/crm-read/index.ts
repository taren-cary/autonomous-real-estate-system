import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

type Operation = "get_contact" | "get_contact_by_id" | "list_contacts" | "pipeline_summary"

interface CrmReadRequest {
  agent_id: string
  operation: Operation
  filters?: {
    phone?: string
    contact_id?: string
    pipeline_stage?: string
    tags?: string[]
    limit?: number
  }
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } })

// All HubSpot stage keys for pipeline_summary
const ALL_STAGES = ["new_lead", "qualified", "showing_scheduled", "showing_complete", "active_buyer", "under_contract", "closed"]

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  let body: CrmReadRequest
  try { body = await req.json() }
  catch { return json({ error: "Invalid JSON" }, 400) }

  const { agent_id, operation, filters = {} } = body
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

    const hsGetNotes = async (contactId: string) => {
      const res = await fetch(
        `https://api.maton.ai/hubspot/crm/v3/objects/notes?associations=contacts&contactId=${contactId}&properties=hs_note_body,hs_timestamp&limit=10`,
        { headers: h }
      )
      if (!res.ok) return []
      return (await res.json())?.results || []
    }

    if (operation === "get_contact") {
      if (!filters.phone) return json({ error: "filters.phone required" }, 400)
      const res = await fetch("https://api.maton.ai/hubspot/crm/v3/objects/contacts/search", {
        method: "POST", headers: h,
        body: JSON.stringify({
          filterGroups: [{ filters: [{ propertyName: "phone", operator: "EQ", value: filters.phone }] }],
          properties: ["firstname", "lastname", "email", "phone", "real_estate_stage"],
          limit: 1
        })
      })
      if (!res.ok) return json({ error: "Failed to search" }, 502)
      const contact = (await res.json())?.results?.[0] || null
      if (!contact) return json({ contact: null })
      return json({ contact: { ...contact, notes: await hsGetNotes(contact.id) } })
    }

    if (operation === "get_contact_by_id") {
      if (!filters.contact_id) return json({ error: "filters.contact_id required" }, 400)
      const res = await fetch(
        `https://api.maton.ai/hubspot/crm/v3/objects/contacts/${filters.contact_id}?properties=firstname,lastname,email,phone,real_estate_stage`,
        { headers: h }
      )
      if (!res.ok) return json({ error: "Failed to fetch contact" }, 502)
      const contact = await res.json()
      return json({ contact: { ...contact, notes: await hsGetNotes(contact.id) } })
    }

    if (operation === "list_contacts") {
      const limit = filters.limit || 50
      const searchBody: Record<string, unknown> = {
        properties: ["firstname", "lastname", "email", "phone", "real_estate_stage"],
        limit
      }
      if (filters.pipeline_stage) {
        searchBody.filterGroups = [{ filters: [{ propertyName: "real_estate_stage", operator: "EQ", value: filters.pipeline_stage }] }]
      }
      const res = await fetch("https://api.maton.ai/hubspot/crm/v3/objects/contacts/search", {
        method: "POST", headers: h, body: JSON.stringify(searchBody)
      })
      if (!res.ok) return json({ error: "Failed to list contacts" }, 502)
      const data = await res.json()
      return json({ contacts: data.results || [], total: data.total || 0 })
    }

    if (operation === "pipeline_summary") {
      const summary: Record<string, number> = {}
      await Promise.all(ALL_STAGES.map(async (stage) => {
        const res = await fetch("https://api.maton.ai/hubspot/crm/v3/objects/contacts/search", {
          method: "POST", headers: h,
          body: JSON.stringify({
            filterGroups: [{ filters: [{ propertyName: "real_estate_stage", operator: "EQ", value: stage }] }],
            limit: 1
          })
        })
        if (res.ok) summary[stage] = (await res.json()).total || 0
      }))
      return json({ pipeline_summary: summary, total_open: Object.values(summary).reduce((a, b) => a + b, 0) })
    }
  }

  // ── GHL path ──────────────────────────────────────────────────────────────
  if (!client.ghl_connection_id) return json({ error: "No CRM configured" }, 503)

  const locationId = client.ghl_location_id
  const pipelineId = client.ghl_pipeline_id
  if (!locationId) return json({ error: "GHL location ID not configured" }, 503)

  const h: Record<string, string> = {
    "Authorization": `Bearer ${matonKey}`,
    "Maton-Connection": client.ghl_connection_id
  }

  if (operation === "get_contact") {
    if (!filters.phone) return json({ error: "filters.phone required" }, 400)
    const res = await fetch(`https://api.maton.ai/highlevel-pit/contacts/?locationId=${locationId}&query=${encodeURIComponent(filters.phone)}&limit=1`, { headers: h })
    if (!res.ok) return json({ error: "Failed to search" }, 502)
    const contact = (await res.json())?.contacts?.[0] || null
    if (!contact) return json({ contact: null })
    const notesRes = await fetch(`https://api.maton.ai/highlevel-pit/contacts/${contact.id}/notes`, { headers: h })
    return json({ contact: { ...contact, notes: notesRes.ok ? (await notesRes.json())?.notes || [] : [] } })
  }

  if (operation === "get_contact_by_id") {
    if (!filters.contact_id) return json({ error: "filters.contact_id required" }, 400)
    const res = await fetch(`https://api.maton.ai/highlevel-pit/contacts/${filters.contact_id}`, { headers: h })
    if (!res.ok) return json({ error: "Failed to fetch" }, 502)
    const contact = (await res.json())?.contact || null
    if (!contact) return json({ contact: null })
    const notesRes = await fetch(`https://api.maton.ai/highlevel-pit/contacts/${filters.contact_id}/notes`, { headers: h })
    return json({ contact: { ...contact, notes: notesRes.ok ? (await notesRes.json())?.notes || [] : [] } })
  }

  if (operation === "list_contacts") {
    const limit = filters.limit || 50
    if (filters.pipeline_stage && pipelineId) {
      const pRes = await fetch(`https://api.maton.ai/highlevel-pit/opportunities/pipelines?locationId=${locationId}`, { headers: h })
      if (!pRes.ok) return json({ error: "Failed to fetch pipeline" }, 502)
      const pData = await pRes.json()
      const pipeline = pData?.pipelines?.find((p: { id: string }) => p.id === pipelineId) ?? pData?.pipelines?.[0]
      const stage = pipeline?.stages?.find((s: { name: string; id: string }) =>
        s.name.toLowerCase().replace(/\s+/g, "_") === filters.pipeline_stage ||
        s.name.toLowerCase() === (filters.pipeline_stage || "").replace(/_/g, " ")
      )
      if (!stage) return json({ contacts: [], total: 0 })
      const oRes = await fetch(`https://api.maton.ai/highlevel-pit/opportunities/search?location_id=${locationId}&pipeline_id=${pipelineId}&pipeline_stage_id=${stage.id}&status=open&limit=${limit}`, { headers: h })
      if (!oRes.ok) return json({ error: "Failed to fetch opportunities" }, 502)
      const opps = (await oRes.json())?.opportunities || []
      const contacts = await Promise.all(opps.map(async (opp: Record<string, unknown>) => {
        const cid = opp.contactId as string
        if (!cid) return { contact_id: cid, pipeline_stage: stage.name }
        const fRes = await fetch(`https://api.maton.ai/highlevel-pit/contacts/${cid}`, { headers: h })
        if (!fRes.ok) return { contact_id: cid, pipeline_stage: stage.name }
        return { ...(await fRes.json())?.contact || {}, pipeline_stage: stage.name, opportunity_id: opp.id }
      }))
      return json({ contacts, total: contacts.length })
    }
    const res = await fetch(`https://api.maton.ai/highlevel-pit/contacts/?locationId=${locationId}&limit=${limit}`, { headers: h })
    if (!res.ok) return json({ error: "Failed to fetch contacts" }, 502)
    let contacts = (await res.json())?.contacts || []
    if (filters.tags?.length) contacts = contacts.filter((c: { tags?: string[] }) => filters.tags!.some(t => (c.tags || []).includes(t)))
    return json({ contacts, total: contacts.length })
  }

  if (operation === "pipeline_summary") {
    if (!pipelineId) return json({ error: "Pipeline not configured" }, 503)
    const [oRes, pRes] = await Promise.all([
      fetch(`https://api.maton.ai/highlevel-pit/opportunities/search?location_id=${locationId}&pipeline_id=${pipelineId}&status=open&limit=100`, { headers: h }),
      fetch(`https://api.maton.ai/highlevel-pit/opportunities/pipelines?locationId=${locationId}`, { headers: h })
    ])
    if (!oRes.ok) return json({ error: "Failed to fetch opportunities" }, 502)
    const pData = pRes.ok ? await pRes.json() : {}
    const pipeline = pData?.pipelines?.find((p: { id: string }) => p.id === pipelineId) ?? pData?.pipelines?.[0]
    const stageMap: Record<string, string> = {}
    for (const s of pipeline?.stages || []) stageMap[s.id] = s.name
    const opps = (await oRes.json())?.opportunities || []
    const summary: Record<string, number> = {}
    for (const opp of opps) {
      const n = stageMap[opp.pipelineStageId] || "Unknown"
      summary[n] = (summary[n] || 0) + 1
    }
    return json({ pipeline_summary: summary, total_open: opps.length })
  }

  return json({ error: `Unknown operation: ${operation}` }, 400)
})
