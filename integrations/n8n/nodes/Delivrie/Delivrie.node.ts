import type { INodeProperties, INodeType, INodeTypeDescription } from 'n8n-workflow';

// Declarative node: each operation maps straight onto a Delivrie API request.
const API = 'https://delivrie.io/api';
const list = (field: string) => `={{ (Array.isArray($parameter["${field}"]) ? $parameter["${field}"] : String($parameter["${field}"] || "").split(",")).map(s => String(s).trim()).filter(Boolean) }}`;

const resource: INodeProperties = {
	displayName: 'Resource',
	name: 'resource',
	type: 'options',
	noDataExpression: true,
	options: [
		{ name: 'Email', value: 'email' },
		{ name: 'Contact', value: 'contact' },
		{ name: 'Segment', value: 'segment' },
		{ name: 'Event', value: 'event' },
		{ name: 'Broadcast', value: 'broadcast' },
		{ name: 'Inbox', value: 'inbox' },
	],
	default: 'email',
};

const operations: INodeProperties[] = [
	{
		displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true,
		displayOptions: { show: { resource: ['email'] } },
		options: [
			{ name: 'Send', value: 'send', action: 'Send an email', routing: { request: { method: 'POST', url: '/emails' } } },
			{ name: 'Send Template', value: 'sendTemplate', action: 'Send a published template', routing: { request: { method: 'POST', url: '/emails' } } },
			{ name: 'Get', value: 'get', action: 'Get an email with its events', routing: { request: { method: 'GET', url: '=/emails/{{encodeURIComponent($parameter["emailId"])}}' } } },
			{ name: 'Get Many', value: 'getAll', action: 'Get recent emails', routing: { request: { method: 'GET', url: '/emails', qs: { limit: '={{$parameter["limit"]}}' } }, output: { postReceive: [{ type: 'rootProperty', properties: { property: 'data' } }] } } },
		],
		default: 'send',
	},
	{
		displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true,
		displayOptions: { show: { resource: ['contact'] } },
		options: [
			{ name: 'Create or Update', value: 'upsert', action: 'Create or update a contact', routing: { request: { method: 'POST', url: '/contacts' } } },
			{ name: 'Get', value: 'get', action: 'Get a contact', routing: { request: { method: 'GET', url: '=/contacts/{{encodeURIComponent($parameter["contactEmail"].toLowerCase())}}' } } },
			{ name: 'Unsubscribe', value: 'unsubscribe', action: 'Unsubscribe a contact', routing: { request: { method: 'PATCH', url: '=/contacts/{{encodeURIComponent($parameter["contactEmail"].toLowerCase())}}', body: { unsubscribed: true } } } },
			{ name: 'Delete', value: 'delete', action: 'Delete a contact', routing: { request: { method: 'DELETE', url: '=/contacts/{{encodeURIComponent($parameter["contactEmail"].toLowerCase())}}' } } },
		],
		default: 'upsert',
	},
	{
		displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true,
		displayOptions: { show: { resource: ['segment'] } },
		options: [
			{ name: 'Add Contacts', value: 'add', action: 'Add contacts to a segment', routing: { request: { method: 'POST', url: '=/segments/{{$parameter["segmentId"]}}/contacts', body: { contacts: list('emails') } } } },
			{ name: 'Remove Contacts', value: 'remove', action: 'Remove contacts from a segment', routing: { request: { method: 'DELETE', url: '=/segments/{{$parameter["segmentId"]}}/contacts', body: { contacts: list('emails') } } } },
			{ name: 'Get Many', value: 'getAll', action: 'Get segments', routing: { request: { method: 'GET', url: '/segments' }, output: { postReceive: [{ type: 'rootProperty', properties: { property: 'data' } }] } } },
		],
		default: 'add',
	},
	{
		displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true,
		displayOptions: { show: { resource: ['event'] } },
		options: [{ name: 'Send', value: 'send', action: 'Send an event that starts automations', routing: { request: { method: 'POST', url: '/events' } } }],
		default: 'send',
	},
	{
		displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true,
		displayOptions: { show: { resource: ['broadcast'] } },
		options: [
			{ name: 'Send', value: 'send', action: 'Send or schedule a broadcast', routing: { request: { method: 'POST', url: '=/broadcasts/{{$parameter["broadcastId"]}}/send', body: { scheduled_at: '={{$parameter["scheduledAt"] || undefined}}' } } } },
			{ name: 'Get', value: 'get', action: 'Get a broadcast with its stats', routing: { request: { method: 'GET', url: '=/broadcasts/{{$parameter["broadcastId"]}}' } } },
		],
		default: 'send',
	},
	{
		displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true,
		displayOptions: { show: { resource: ['inbox'] } },
		options: [
			{ name: 'Get Threads', value: 'threads', action: 'Get inbox threads', routing: { request: { method: 'GET', url: '/inbox/threads', qs: { q: '={{$parameter["query"] || undefined}}', limit: '={{$parameter["limit"]}}' } }, output: { postReceive: [{ type: 'rootProperty', properties: { property: 'data' } }] } } },
			{ name: 'Reply', value: 'reply', action: 'Reply in a thread', routing: { request: { method: 'POST', url: '=/inbox/threads/{{$parameter["threadId"]}}/reply', body: { text: '={{$parameter["replyText"]}}' } } } },
			{ name: 'Create Draft', value: 'draft', action: 'Save a reply draft for review', routing: { request: { method: 'POST', url: '/inbox/drafts', body: { thread_id: '={{$parameter["threadId"]}}', text: '={{$parameter["replyText"]}}' } } } },
		],
		default: 'threads',
	},
];

const show = (resource: string, operation: string[]) => ({ show: { resource: [resource], operation } });
const send = (field: string, extra: object = {}) => ({ send: { type: 'body' as const, property: field, ...extra } });

const fields: INodeProperties[] = [
	// email
	{ displayName: 'From', name: 'from', type: 'string', required: true, default: '', placeholder: 'Acme <hello@mail.acme.com>', description: 'A sender on a verified domain', displayOptions: show('email', ['send', 'sendTemplate']), routing: send('from') },
	{ displayName: 'To', name: 'to', type: 'string', required: true, default: '', placeholder: 'ada@example.com', description: 'Recipients, comma-separated', displayOptions: show('email', ['send', 'sendTemplate']), routing: { send: { type: 'body', property: 'to', value: list('to') } } },
	{ displayName: 'Subject', name: 'subject', type: 'string', default: '', displayOptions: show('email', ['send', 'sendTemplate']), routing: send('subject', { value: '={{$value || undefined}}' }) },
	{ displayName: 'HTML', name: 'html', type: 'string', typeOptions: { rows: 6 }, default: '', displayOptions: show('email', ['send']), routing: send('html', { value: '={{$value || undefined}}' }) },
	{ displayName: 'Text', name: 'text', type: 'string', typeOptions: { rows: 4 }, default: '', displayOptions: show('email', ['send']), routing: send('text', { value: '={{$value || undefined}}' }) },
	{ displayName: 'Template', name: 'template', type: 'string', required: true, default: '', description: 'The alias or ID of a published template', displayOptions: show('email', ['sendTemplate']), routing: { send: { type: 'body', property: 'template', value: '={{ { id: $value, variables: JSON.parse($parameter["variables"] || "{}") } }}' } } },
	{ displayName: 'Variables (JSON)', name: 'variables', type: 'json', default: '{}', displayOptions: show('email', ['sendTemplate']) },
	{
		displayName: 'Options', name: 'options', type: 'collection', placeholder: 'Add option', default: {}, displayOptions: show('email', ['send', 'sendTemplate']),
		options: [
			{ displayName: 'Reply-To', name: 'reply_to', type: 'string', default: '', routing: send('reply_to') },
			{ displayName: 'Cc', name: 'cc', type: 'string', default: '', routing: send('cc') },
			{ displayName: 'Bcc', name: 'bcc', type: 'string', default: '', routing: send('bcc') },
			{ displayName: 'Send At', name: 'scheduled_at', type: 'dateTime', default: '', routing: send('scheduled_at') },
			{ displayName: 'Attachment URL', name: 'attachment', type: 'string', default: '', routing: { send: { type: 'body', property: 'attachments', value: '={{ [{ path: $value }] }}' } } },
			{ displayName: 'Idempotency Key', name: 'idempotencyKey', type: 'string', default: '', routing: { request: { headers: { 'Idempotency-Key': '={{$value}}' } } } },
		],
	},
	{ displayName: 'Email ID', name: 'emailId', type: 'string', required: true, default: '', displayOptions: show('email', ['get']) },
	{ displayName: 'Limit', name: 'limit', type: 'number', typeOptions: { minValue: 1, maxValue: 100 }, default: 20, displayOptions: { show: { resource: ['email', 'inbox'], operation: ['getAll', 'threads'] } } },
	// contact
	{ displayName: 'Email', name: 'email', type: 'string', required: true, default: '', displayOptions: show('contact', ['upsert']), routing: send('email') },
	{ displayName: 'Email', name: 'contactEmail', type: 'string', required: true, default: '', displayOptions: show('contact', ['get', 'unsubscribe', 'delete']) },
	{
		displayName: 'Fields', name: 'contactFields', type: 'collection', placeholder: 'Add field', default: {}, displayOptions: show('contact', ['upsert']),
		options: [
			{ displayName: 'First Name', name: 'first_name', type: 'string', default: '', routing: send('first_name') },
			{ displayName: 'Last Name', name: 'last_name', type: 'string', default: '', routing: send('last_name') },
			{ displayName: 'Segment ID', name: 'segment_id', type: 'string', default: '', routing: { send: { type: 'body', property: 'segments', value: '={{ [$value] }}' } } },
			{ displayName: 'Properties (JSON)', name: 'properties', type: 'json', default: '{}', routing: { send: { type: 'body', property: 'properties', value: '={{ JSON.parse($value || "{}") }}' } } },
			{ displayName: 'Unsubscribed', name: 'unsubscribed', type: 'boolean', default: false, routing: send('unsubscribed') },
		],
	},
	// segment
	{ displayName: 'Segment ID', name: 'segmentId', type: 'string', required: true, default: '', displayOptions: show('segment', ['add', 'remove']) },
	{ displayName: 'Emails', name: 'emails', type: 'string', required: true, default: '', description: 'Comma-separated', displayOptions: show('segment', ['add', 'remove']) },
	// event
	{ displayName: 'Event Name', name: 'eventName', type: 'string', required: true, default: '', placeholder: 'user.signed_up', displayOptions: show('event', ['send']), routing: send('name') },
	{ displayName: 'Contact Email', name: 'eventEmail', type: 'string', required: true, default: '', displayOptions: show('event', ['send']), routing: send('email') },
	{ displayName: 'Data (JSON)', name: 'eventData', type: 'json', default: '{}', displayOptions: show('event', ['send']), routing: { send: { type: 'body', property: 'data', value: '={{ JSON.parse($value || "{}") }}' } } },
	// broadcast
	{ displayName: 'Broadcast ID', name: 'broadcastId', type: 'string', required: true, default: '', displayOptions: show('broadcast', ['send', 'get']) },
	{ displayName: 'Send At', name: 'scheduledAt', type: 'dateTime', default: '', description: 'Leave empty to send now', displayOptions: show('broadcast', ['send']) },
	// inbox
	{ displayName: 'Search', name: 'query', type: 'string', default: 'is:needs-reply', description: 'Gmail-style search, like label:billing is:unread', displayOptions: show('inbox', ['threads']) },
	{ displayName: 'Thread ID', name: 'threadId', type: 'string', required: true, default: '', displayOptions: show('inbox', ['reply', 'draft']) },
	{ displayName: 'Text', name: 'replyText', type: 'string', typeOptions: { rows: 5 }, required: true, default: '', displayOptions: show('inbox', ['reply', 'draft']) },
];

export class Delivrie implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Delivrie',
		name: 'delivrie',
		icon: 'file:delivrie.svg',
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Send email, manage contacts and segments, start automations and reply in the Inbox with Delivrie',
		defaults: { name: 'Delivrie' },
		inputs: ['main'] as unknown as INodeTypeDescription['inputs'],
		outputs: ['main'] as unknown as INodeTypeDescription['outputs'],
		credentials: [{ name: 'delivrieApi', required: true }],
		requestDefaults: { baseURL: API, headers: { Accept: 'application/json', 'Content-Type': 'application/json' } },
		properties: [resource, ...operations, ...fields],
	};
}
