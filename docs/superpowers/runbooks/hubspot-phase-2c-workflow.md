# HubSpot Approval Workflow — Admin Setup

This runbook is for whoever admins the HubSpot portal. The pricer writes `pricer_approval_status = pending` on a Deal to request manager approval. HubSpot must route that to a manager via a Workflow, capture the decision, and write the result back on the same Deal property.

## Contract (what the pricer expects)

1. Workflow triggers when **Deal → `pricer_approval_status` changes to `pending`**.
2. Workflow routes an approval task to the Deal owner's manager (or a designated approver group — portal's call).
3. Manager approves or rejects in HubSpot's task UI.
4. Workflow writes **`pricer_approval_status = approved`** (or `rejected`) back to the Deal.
5. Workflow must NOT mutate other `pricer_*` Deal properties.

The pricer's webhook on `pricer_approval_status` sees the updated value and resumes publish (or marks the scenario rejected).

## Setup steps

### 1. Create the Workflow

HubSpot UI → **Automation → Workflows → Create workflow → From scratch**.

- **Name:** Pricer Approval — Routing
- **Type:** Deal-based

### 2. Trigger

- Object: Deal
- Filter: `pricer_approval_status` has any value of `pending`
- Re-enrollment: yes

### 3. Manager lookup

One of:

- **Per-Deal-owner routing:** in the workflow, fetch the Deal owner's manager via the owner hierarchy. HubSpot supports this natively via "User's manager" attribution.
- **Approver group:** assign to a static list of approver User IDs.

(Portal's call — this runbook doesn't prescribe which. The rest of the workflow is the same either way.)

### 4. Approval step

- **If-then branch:** use HubSpot's **Approval step** (requires an Operations Hub Professional or Enterprise tier; if not available, use a manual "Create task → assign to manager" step and rely on the manager to set the property directly).
- On approval decision:
  - **Approved:** set Deal `pricer_approval_status = approved`.
  - **Rejected:** set Deal `pricer_approval_status = rejected`.

### 5. Task template

Use any of the pricer-stamped properties for context:

- `{{ deal.pricer_scenario_id }}` — links manager back to the pricer scenario (build a link to `https://ninjapricer-production.up.railway.app/scenarios/{id}` in the task description)
- `{{ deal.pricer_margin_pct }}` — margin for context (stored as a percentage, e.g. `22.00` means 22 %)

### 6. Activate

Publish the workflow. Test with a fake Deal (set `pricer_approval_status = pending` manually in HubSpot; confirm the task routes correctly; approve it; confirm the property flips to `approved`).

### 7. Smoke test end-to-end from the pricer

- Build a scenario in the pricer that triggers a hard rail, record an override.
- Link it to a test HubSpot Deal.
- Click **Publish to HubSpot** in the scenario page.
- Expected:
  - Pricer shows "Waiting on manager approval."
  - Deal `pricer_approval_status` is `pending`.
  - Workflow fires; approval task appears for the manager.
  - Manager approves.
  - Within ~5 seconds: pricer's `/admin/hubspot/webhook-events` shows a `pricer_approval_status` event processed.
  - Scenario's HubSpot section transitions to "Published" with the HubSpot Quote URL.

## Troubleshooting

- **Webhook arrives but publish doesn't resume:** check `/admin/hubspot/webhook-events` for the processing error. Most likely: the approval request wasn't found for the Deal (check the Deal has `pricer_scenario_id` stamped and matches a real scenario).
- **Rejected scenarios:** rep sees the rejected state. To re-try after revising: click **Revise and resubmit** on the scenario page.
