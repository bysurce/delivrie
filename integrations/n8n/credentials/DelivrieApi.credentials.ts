import type { IAuthenticateGeneric, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

export class DelivrieApi implements ICredentialType {
	name = 'delivrieApi';

	displayName = 'Delivrie API';

	documentationUrl = 'https://delivrie.io/docs/n8n';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Create one in Delivrie under API keys. Full access is needed for contacts, segments and the trigger.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://delivrie.io/api',
			url: '/usage',
		},
	};
}
