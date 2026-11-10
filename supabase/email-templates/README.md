# Email templates

Paste these into Supabase under **Authentication → Emails → Templates**:

| Template in Supabase | File | Suggested subject |
| --- | --- | --- |
| Confirm signup | `confirm-signup.html` | Confirm your Overlap account |
| Reset password | `reset-password.html` | Reset your Overlap password |

Both use `{{ .ConfirmationURL }}`, which sends people through `/auth/callback` on your site.
