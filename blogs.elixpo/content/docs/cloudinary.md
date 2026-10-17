A personal Cloudinary connection lets new blog covers and editor images use a Cloudinary product environment you control. It is optional; eligible accounts can continue using LixBlogs-managed storage.

## Connect

1. Open **Settings → Integrations**.
2. Under **Personal Cloudinary storage**, choose **Connect Cloudinary**.
3. Sign in to Cloudinary if requested.
4. Select the product environment and approve the requested permissions.
5. Return to LixBlogs and confirm that the product environment is shown as connected.

LixBlogs requests **OpenID**, **Offline Access**, **Asset Management**, and **Upload** access. These permissions identify the selected environment, upload and delete LixBlogs media, and refresh the connection without asking you to sign in for every upload. LixBlogs does not receive your Cloudinary password or API secret through OAuth.

## Choose where new media is stored

After connecting, select **Use personal storage**. The status panel names the active product environment and shows the number and tracked size of LixBlogs assets stored there. You can switch back to LixBlogs storage at any time; existing media is not migrated.

## Disconnect

Before removing the connection, delete all LixBlogs-tracked assets owned by that personal environment from the Media tab. LixBlogs then revokes the OAuth refresh token and removes its stored connection record. You can also revoke access from Cloudinary's connected-app controls.

Disconnecting does not delete unrelated Cloudinary assets. If an upload is visible in Cloudinary but is no longer tracked by LixBlogs, manage it directly in Cloudinary.

## Troubleshooting

- **No product environment identified** — reconnect and approve all requested scopes, including OpenID.
- **Connection expired** — reconnect Cloudinary; new personal-storage uploads pause until authorization is restored.
- **Cannot disconnect** — remove the LixBlogs media listed for that storage space first.
- **Upload rejected** — check the product environment's quota, account status, and allowed media type.
