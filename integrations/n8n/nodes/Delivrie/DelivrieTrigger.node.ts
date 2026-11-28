import { createHmac, timingSafeEqual } from 'crypto';
import type { IDataObject, IHookFunctions, INodeType, INodeTypeDescription, IWebhookFunctions, IWebhookResponseData } from 'n8n-workflow';

const API = 'https://delivrie.io/api';

const EVENTS = [
	'email.sent', 'email.delivered', 'email.delivery_delayed', 'email.bounced', 'email.complained', 'email.opened', 'email.clicked', 'email.failed', 'email.received',
	'contact.created', 'contact.updated', 'contact.deleted', 'contact.import.completed',
	'domain.created', 'domain.updated',
	'broadcast.created', 'broadcast.scheduled', 'broadcast.sending', 'broadcast.sent', 'broadcast.canceled',
	'inbox.email.received', 'inbox.email.sent', 'inbox.thread.updated', 'inbox.draft.created', 'inbox.note.created', 'inbox.agent.completed', 'inbox.agent.failed',
];

/** Standard Webhooks: v1,<base64 HMAC-SHA256 of id.timestamp.body> with the base64 secret after whsec_. */
export function verifySignature(secret: string, id: string, ts: string, body: string, signatures: string, now = Math.floor(Date.now() / 1000)): boolean {
	if (!secret || !id || !/^\d+$/.test(ts || '') || !signatures) return false;
	if (Math.abs(now - Number(ts)) > 300) return false;
	const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
	const expected = createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest();
	return signatures.split(/\s+/).some((part) => {
		const [v, sig] = part.split(',', 2);
		if (v !== 'v1' || !sig) return false;
		const got = Buffer.from(sig, 'base64');
		return got.length === expected.length && timingSafeEqual(got, expected);
	});
}

export class DelivrieTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Delivrie Trigger',
		name: 'delivrieTrigger',
		icon: 'file:delivrie.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description: 'Starts the workflow on Delivrie events: deliveries, bounces, opens and clicks, received mail, contacts, broadcasts and the Inbox',
		defaults: { name: 'Delivrie Trigger' },
		inputs: [] as unknown as INodeTypeDescription['inputs'],
		outputs: ['main'] as unknown as INodeTypeDescription['outputs'],
		credentials: [{ name: 'delivrieApi', required: true }],
		webhooks: [{ name: 'default', httpMethod: 'POST', responseMode: 'onReceived', path: 'webhook' }],
		properties: [
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				default: ['email.delivered'],
				options: EVENTS.map((e) => ({ name: e, value: e })),
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				if (!data.webhookId) return false;
				const res = (await this.helpers.httpRequestWithAuthentication.call(this, 'delivrieApi', { method: 'GET', url: `${API}/webhooks`, json: true })) as IDataObject;
				const hooks = (res.data as IDataObject[]) || [];
				const url = this.getNodeWebhookUrl('default');
				const found = hooks.find((h) => h.id === data.webhookId && h.endpoint === url);
				if (!found) { delete data.webhookId; delete data.secret; }
				return !!found;
			},
			async create(this: IHookFunctions): Promise<boolean> {
				const res = (await this.helpers.httpRequestWithAuthentication.call(this, 'delivrieApi', {
					method: 'POST', url: `${API}/webhooks`, json: true,
					body: { endpoint: this.getNodeWebhookUrl('default'), events: this.getNodeParameter('events') as string[] },
				})) as IDataObject;
				const data = this.getWorkflowStaticData('node');
				data.webhookId = res.id;
				data.secret = res.signing_secret;
				return true;
			},
			async delete(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				if (data.webhookId) {
					try { await this.helpers.httpRequestWithAuthentication.call(this, 'delivrieApi', { method: 'DELETE', url: `${API}/webhooks/${data.webhookId}`, json: true }); } catch { /* already gone */ }
				}
				delete data.webhookId;
				delete data.secret;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const data = this.getWorkflowStaticData('node');
		const raw = (req as unknown as { rawBody?: Buffer }).rawBody?.toString('utf8') ?? JSON.stringify(req.body);
		const h = (name: string) => String(req.headers[name] ?? '');
		if (data.secret && !verifySignature(String(data.secret), h('webhook-id'), h('webhook-timestamp'), raw, h('webhook-signature'))) {
			const res = this.getResponseObject();
			res.status(401).send('Invalid signature').end();
			return { noWebhookResponse: true };
		}
		const event = req.body as IDataObject;
		return { workflowData: [this.helpers.returnJsonArray([{ ...event, webhook_id: h('webhook-id') }])] };
	}
}
