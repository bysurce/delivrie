# List audit log entries

`GET https://delivrie.io/api/audit-logs`

Who changed what in the team, newest first. Enterprise plan; other plans get 403 plan_required.

Access: Needs a full access key..

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `limit` | number | No | 1 to 200, default 50. |
| `before` | string | No | An entry id: returns older entries. |
| `action` | string | No | Only actions starting with this, e.g. domain. or billing.plan_changed. |
| `actor` | string | No | Only entries by this user id or API key id. |

## Example request

```bash
curl -X GET 'https://delivrie.io/api/audit-logs' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "object": "list",
  "has_more": false,
  "data": [
    {
      "object": "audit_log",
      "id": "1842",
      "created_at": "2026-11-23T14:02:11.000Z",
      "actor_type": "user",
      "actor_label": "ada@acme.com",
      "action": "api_key.created",
      "target_type": "api_key",
      "target_label": "Production",
      "metadata": {
        "permission": "sending"
      },
      "ip": "102.89.34.10"
    }
  ]
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
