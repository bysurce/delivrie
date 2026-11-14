# Count recipients

`GET https://delivrie.io/api/broadcasts/:id/recipients`

How many contacts a broadcast will reach: everyone in the segment, how many opted out of its topic, and how many remain after unsubscribes and suppressions.

Access: Needs a full access key..

## Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Authorization` | string | Yes | Bearer dlv_your_key |

## Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | The broadcast id. |

## Example request

```bash
curl -X GET 'https://delivrie.io/api/broadcasts/4ef9a417/recipients' \
  -H 'Authorization: Bearer dlv_live_••••'
```

## Response

```json
{
  "total": 3400,
  "topic_opt_out": 120,
  "recipients": 3240
}
```

## Errors

| Status | Name | When |
| --- | --- | --- |
| 401 | `missing_api_key` | No Authorization header was sent. |
| 404 | `not_found` | Nothing with that id on this team. |
