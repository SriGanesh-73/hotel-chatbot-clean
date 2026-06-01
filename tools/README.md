# Tools

### generateResetLink.js

Use this helper to generate a Firebase password reset link locally using the service account JSON included in the repo.

Prerequisites:
- Node installed (same runtime used by the project)
- The service account JSON `hotel-chatbot-1ae67-firebase-adminsdk-fbsvc-a21ec05157.json` exists at the repo root.

Run:

```bash
node tools/generateResetLink.js user@example.com
```

This will print a password reset link you can paste in the browser to verify the reset flow.

Troubleshooting checklist for missing reset emails:
- Ensure your Firebase project is using default email sending (Firebase sends emails from its own servers) or configure a custom SMTP provider in the Firebase Console > Authentication > Templates > Email provider.
- Check your project's Firebase Console for email action settings (Authorized domains, templates).
- If using a custom domain or dynamic links, ensure the domain is authorized and dynamic links are configured.
- If your project sends reset links but you don't receive email, check the spam folder or email provider blocks. Generating the reset link locally helps bypass email delivery to manually verify.
- Verify the user's email exists in Authentication users in the Firebase Console.
