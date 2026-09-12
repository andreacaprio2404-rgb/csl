const { GHL_LOCATION_ID, GHL_PIPELINE_ID, GHL_TIER_FIELD_ID, OUTCOME_TO_GHL, QUALIFIED_TAG, PACKAGE_TO_GHL_TIER } = require("./config");

const GHL_API_URL = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

function headers() {
  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey) throw new Error("GHL_API_KEY not set");
  return {
    Authorization: `Bearer ${apiKey}`,
    Version: GHL_VERSION,
    "content-type": "application/json",
  };
}

async function ghlRequest(method, path, body) {
  const response = await fetch(`${GHL_API_URL}${path}`, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ghl_request_failed method=${method} path=${path} status=${response.status} body=${text.slice(0, 2000)}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function findContactByEmail(email) {
  if (!email) return null;
  const result = await ghlRequest("POST", "/contacts/search", {
    locationId: GHL_LOCATION_ID,
    filters: [{ field: "email", operator: "eq", value: email }],
    pageLimit: 1,
  });
  return result.contacts?.[0] || null;
}

async function addNote(contactId, body) {
  return ghlRequest("POST", `/contacts/${contactId}/notes`, { body });
}

async function addTag(contactId, tag) {
  return ghlRequest("POST", `/contacts/${contactId}/tags`, { tags: [tag] });
}

async function setTierField(contactId, packageRecommended) {
  const tier = PACKAGE_TO_GHL_TIER[packageRecommended];
  if (!tier) return null; // package doesn't map cleanly to Launch/Deploy/Command, leave untouched
  return ghlRequest("PUT", `/contacts/${contactId}`, {
    customFields: [{ id: GHL_TIER_FIELD_ID, fieldValue: tier }],
  });
}

async function findOpenOpportunity(contactId) {
  const result = await ghlRequest(
    "GET",
    `/opportunities/search?contactId=${encodeURIComponent(contactId)}&pipelineId=${encodeURIComponent(GHL_PIPELINE_ID)}&status=all&limit=1&order=added_desc`
  );
  return result.opportunities?.[0] || null;
}

async function createOpportunity({ contactId, name, stageId, status }) {
  const result = await ghlRequest("POST", "/opportunities/", {
    pipelineId: GHL_PIPELINE_ID,
    name,
    pipelineStageId: stageId,
    status,
    contactId,
  });
  return result.opportunity;
}

async function updateOpportunity(opportunityId, { stageId, status }) {
  return ghlRequest("PUT", `/opportunities/${opportunityId}`, {
    pipelineStageId: stageId,
    status,
  });
}

// Applies the call outcome to GHL: pipeline stage plus opportunity status
// (from outcome), the Qualified/Not Qualified tag (from the rubric's own
// yes/no/unclear qualified determination, independent of outcome), and the
// Tier custom field. Best effort, each sub step is isolated so one failure
// (e.g. tag already exists) doesn't block the others.
async function applyOutcomeToGhl({ contactId, prospectName, outcome, qualified, packageRecommended }) {
  const results = {};
  const mapping = OUTCOME_TO_GHL[outcome];

  if (mapping) {
    try {
      let opportunity = await findOpenOpportunity(contactId);
      if (opportunity) {
        results.opportunity = await updateOpportunity(opportunity.id, {
          stageId: mapping.stage,
          status: mapping.status,
        });
      } else {
        results.opportunity = await createOpportunity({
          contactId,
          name: `${prospectName} · Case Command`,
          stageId: mapping.stage,
          status: mapping.status,
        });
      }
    } catch (err) {
      results.opportunityError = String(err);
    }
  }

  const qualifiedTag = QUALIFIED_TAG[qualified];
  if (qualifiedTag) {
    try {
      results.tag = await addTag(contactId, qualifiedTag);
    } catch (err) {
      results.tagError = String(err);
    }
  }

  if (packageRecommended) {
    try {
      results.tierField = await setTierField(contactId, packageRecommended);
    } catch (err) {
      results.tierFieldError = String(err);
    }
  }

  return results;
}

module.exports = {
  findContactByEmail,
  addNote,
  addTag,
  setTierField,
  applyOutcomeToGhl,
};
