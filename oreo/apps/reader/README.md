# Reader — bundled documents

Drop `.md` or `.txt` files into this folder and they'll be deployed to
the badge alongside the OS, then listed in the Reader app picker (with
a leading `*` to mark them as bundled vs BT-arrived).

Workflow:

```bash
cp ~/notes/quick-reference.md apps/reader/assets/
python tools/deploy.py /dev/ttyACM0
```

On the badge: open Reader → the file shows up as `* quick-reference.md`.

BT-sideloaded documents land in `documents/` on the device and appear
in the same picker without the `*` prefix.
