---
name: External deployment artwork
description: Keeping static site images available when building outside the workspace.
---

Do not assume that workspace-uploaded files will be present in an external deployment checkout.

**Why:** A Vercel website build failed on a homepage image imported from the workspace upload directory even though the image existed and builds passed locally.

**How to apply:** Package small, permanent site artwork with the website's version-controlled source assets and verify that the file is not ignored. Use persistent asset storage for large media or runtime uploads rather than adding bulky attachments to Git. Preserve the user's original uploaded file.
