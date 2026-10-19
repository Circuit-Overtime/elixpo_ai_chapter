"use client";

// Client-side Google Drive Picker. Loads GIS + the Picker API on demand, gets a
// drive.file access token (client-side consent), and opens the picker. Because
// the app uses ONE OAuth client id for both the Picker and the server-side Drive
// connection, a file picked here is granted to our app and the send pipeline's
// stored token (same client id) can download it later.
//
// Needs NEXT_PUBLIC_GOOGLE_CLIENT_ID + NEXT_PUBLIC_GOOGLE_PICKER_KEY (inlined at
// build time). Throws "not_configured" when absent.

export interface PickedFile {
    id: string;
    name: string;
    mimeType: string;
    sizeBytes: number | null;
}

const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

function loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) return resolve();
        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error(`failed to load ${src}`));
        document.head.appendChild(s);
    });
}

function getAccessToken(clientId: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const g = (window as any).google;
        const client = g.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: DRIVE_FILE_SCOPE,
            callback: (resp: any) => {
                if (resp?.access_token) resolve(resp.access_token);
                else reject(new Error("no_token"));
            },
            error_callback: () => reject(new Error("token_error")),
        });
        client.requestAccessToken();
    });
}

/** Open the Drive Picker and resolve the chosen file (or null if cancelled). */
export async function openDrivePicker(): Promise<PickedFile | null> {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PICKER_KEY;
    if (!clientId || !apiKey) throw new Error("not_configured");

    await loadScript("https://accounts.google.com/gsi/client");
    await loadScript("https://apis.google.com/js/api.js");
    await new Promise<void>((resolve, reject) => {
        (window as any).gapi.load("picker", {
            callback: () => resolve(),
            onerror: () => reject(new Error("picker_load")),
        });
    });

    const token = await getAccessToken(clientId);
    const picker = (window as any).google.picker;
    // The GCP project NUMBER. Recommended for drive.file so a picked file is
    // shared with the app (and thus downloadable by the server token later).
    const appId = process.env.NEXT_PUBLIC_GOOGLE_APP_ID;

    return new Promise<PickedFile | null>((resolve) => {
        const view = new picker.DocsView(picker.ViewId.DOCS)
            .setIncludeFolders(true)
            .setSelectFolderEnabled(false);
        let builder = new picker.PickerBuilder()
            .addView(view)
            .setOAuthToken(token)
            .setDeveloperKey(apiKey)
            .setCallback((data: any) => {
                if (data.action === picker.Action.PICKED) {
                    const doc = data.docs?.[0];
                    resolve(
                        doc
                            ? {
                                  id: doc.id,
                                  name: doc.name || "attachment",
                                  mimeType: doc.mimeType || "application/octet-stream",
                                  sizeBytes: doc.sizeBytes ? Number(doc.sizeBytes) : null,
                              }
                            : null,
                    );
                } else if (data.action === picker.Action.CANCEL) {
                    resolve(null);
                }
            });
        if (appId) builder = builder.setAppId(appId);
        builder.build().setVisible(true);
    });
}
