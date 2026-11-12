# Email templates

Paste these into Supabase under **Authentication → Emails → Templates**:

| Template in Supabase | File | Suggested subject |
| --- | --- | --- |
| Confirm signup | `confirm-signup.html` | Confirm your Overlap account |
| Reset password | `reset-password.html` | Reset your Overlap password |

Both link to `/auth/confirm` on your site, which works whichever phone, app or browser the email is opened in (the default Supabase link only works in the browser the person signed up in). They use `{{ .SiteURL }}`, so set **Authentication → URL Configuration → Site URL** to your live address, e.g. `https://overlap-yourclub.vercel.app`.
