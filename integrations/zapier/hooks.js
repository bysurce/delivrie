// Instant triggers: subscribing creates a Delivrie webhook pointed at the Zap; turning the Zap off deletes it.
const { call } = require("./api");

const flatten = (event) => ({
  // Zapier de-duplicates on id.
  id: `${event.type}:${(event.data && (event.data.email_id || event.data.thread_id || event.data.id || event.data.draft_id)) || ""}:${event.created_at || ""}`,
  type: event.type,
  created_at: event.created_at,
  ...(event.data || {}),
});

const hookTrigger = ({ key, noun, label, description, events, eventChoices, sample, list }) => ({
  key,
  noun,
  display: { label, description },
  operation: {
    type: "hook",
    inputFields: eventChoices ? [{ key: "events", label: "Events", list: true, required: true, choices: eventChoices, default: Object.keys(eventChoices)[0] }] : [],
    performSubscribe: async (z, bundle) => call(z, "POST", "/webhooks", { endpoint: bundle.targetUrl, events: eventChoices ? [].concat(bundle.inputData.events || Object.keys(eventChoices)) : events }),
    performUnsubscribe: async (z, bundle) => call(z, "DELETE", `/webhooks/${encodeURIComponent(bundle.subscribeData.id)}`),
    perform: async (z, bundle) => [flatten(bundle.cleanedRequest || {})],
    performList: list || (async () => [sample]),
    sample,
  },
});

module.exports = { hookTrigger, flatten };
