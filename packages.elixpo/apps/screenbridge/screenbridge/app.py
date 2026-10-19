"""ScreenBridge command-line entry point and GTK application."""

from __future__ import annotations

import argparse
import sys

from .audio import AudioError, AudioRouter, Device
from . import __version__


def _device_by_default(devices: list[Device], default_name: str) -> int:
    for index, device in enumerate(devices):
        if device.name == default_name:
            return index
    return 0


def run_gui() -> int:
    try:
        import gi

        gi.require_version("Gtk", "4.0")
        from gi.repository import Gio, GLib, Gtk
    except (ImportError, ValueError) as exc:
        print("GTK 4 is required. Install it with: sudo apt install python3-gi gir1.2-gtk-4.0", file=sys.stderr)
        print(exc, file=sys.stderr)
        return 2

    class ScreenBridgeApplication(Gtk.Application):
        def __init__(self) -> None:
            super().__init__(application_id="io.github.screenbridge.app", flags=Gio.ApplicationFlags.DEFAULT_FLAGS)
            self.router = AudioRouter()
            self.window: Gtk.ApplicationWindow | None = None
            self.outputs: list[Device] = []
            self.microphones: list[Device] = []

        def do_activate(self) -> None:
            if self.window is not None:
                self.window.present()
                return

            self.window = Gtk.ApplicationWindow(application=self)
            self.window.set_title("ScreenBridge")
            self.window.set_default_size(480, 360)

            header = Gtk.HeaderBar()
            header_title = Gtk.Label(label="ScreenBridge")
            header_title.add_css_class("title")
            header.set_title_widget(header_title)
            about = Gtk.Button(icon_name="help-about-symbolic")
            about.set_tooltip_text("About ScreenBridge")
            about.add_css_class("flat")
            about.connect("clicked", self.show_about)
            header.pack_end(about)
            self.window.set_titlebar(header)

            root = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=20)
            root.set_margin_top(24)
            root.set_margin_bottom(24)
            root.set_margin_start(24)
            root.set_margin_end(24)
            self.window.set_child(root)

            settings = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
            settings.add_css_class("card")
            root.append(settings)

            output_row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=16)
            output_row.set_margin_top(12)
            output_row.set_margin_bottom(12)
            output_row.set_margin_start(14)
            output_row.set_margin_end(14)
            output_label = Gtk.Label(label="Listen on")
            output_label.set_xalign(0)
            output_label.set_hexpand(True)
            output_row.append(output_label)
            self.output_dropdown = Gtk.DropDown()
            self.output_dropdown.set_size_request(240, -1)
            output_row.append(self.output_dropdown)
            settings.append(output_row)
            settings.append(Gtk.Separator())

            mic_row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=16)
            mic_row.set_margin_top(12)
            mic_row.set_margin_bottom(12)
            mic_row.set_margin_start(14)
            mic_row.set_margin_end(14)
            mic_label = Gtk.Label(label="Microphone")
            mic_label.set_xalign(0)
            mic_label.set_hexpand(True)
            mic_row.append(mic_label)
            self.mic_dropdown = Gtk.DropDown()
            self.mic_dropdown.set_size_request(240, -1)
            mic_row.append(self.mic_dropdown)
            settings.append(mic_row)
            settings.append(Gtk.Separator())

            mix_row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=12)
            mix_row.set_margin_top(14)
            mix_row.set_margin_bottom(14)
            mix_row.set_margin_start(14)
            mix_row.set_margin_end(14)
            mix_title = Gtk.Label(label="Share microphone too")
            mix_title.set_xalign(0)
            mix_title.set_hexpand(True)
            self.mix_switch = Gtk.Switch()
            self.mix_switch.set_valign(Gtk.Align.CENTER)
            mix_row.append(mix_title)
            mix_row.append(self.mix_switch)
            settings.append(mix_row)

            status_row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
            status_row.set_halign(Gtk.Align.CENTER)
            self.status_icon = Gtk.Image.new_from_icon_name("media-playback-stop-symbolic")
            status_row.append(self.status_icon)
            self.status = Gtk.Label(label="Ready")
            self.status.set_xalign(0)
            self.status.set_wrap(True)
            status_row.append(self.status)
            root.append(status_row)

            self.action = Gtk.Button()
            self.action.add_css_class("suggested-action")
            self.action.add_css_class("pill")
            self.action.set_size_request(-1, 46)
            self.action.connect("clicked", self.on_action)
            root.append(self.action)

            self.refresh()
            self.window.present()

        def show_about(self, _button: Gtk.Button) -> None:
            dialog = Gtk.AboutDialog(
                transient_for=self.window,
                modal=True,
                program_name="ScreenBridge",
                version=f"{__version__} Aurora",
                comments="Share computer audio in one click.",
                license_type=Gtk.License.MIT_X11,
                website="https://github.com/elixpo/packages.elixpo/tree/main/apps/screenbridge",
                website_label="GitHub",
            )
            dialog.present()

        def set_error(self, message: str) -> None:
            self.status_icon.set_from_icon_name("dialog-error-symbolic")
            self.status.set_markup(f'<span foreground="red">{GLib.markup_escape_text(message)}</span>')

        def refresh(self) -> None:
            try:
                self.router.ensure_available()
                state = self.router.active_state()
                info = self.router.pactl.info()
                self.outputs = self.router.outputs()
                self.microphones = self.router.microphones()
                self.output_dropdown.set_model(Gtk.StringList.new([d.description for d in self.outputs]))
                self.mic_dropdown.set_model(Gtk.StringList.new([d.description for d in self.microphones]))
                selected_output = state.output if state else info.get("Default Sink", "")
                selected_microphone = state.microphone if state else info.get("Default Source", "")
                self.output_dropdown.set_selected(_device_by_default(self.outputs, selected_output))
                self.mic_dropdown.set_selected(_device_by_default(self.microphones, selected_microphone))
                active = state is not None
                self.output_dropdown.set_sensitive(not active)
                self.mic_dropdown.set_sensitive(not active)
                self.mix_switch.set_sensitive(not active)
                self.action.set_label("Stop sharing audio" if active else "Start sharing audio")
                if active:
                    self.status_icon.set_from_icon_name("audio-volume-high-symbolic")
                    self.status.set_text("Sharing audio")
                    self.mix_switch.set_active(state.mixed)
                    self.action.remove_css_class("suggested-action")
                    self.action.add_css_class("destructive-action")
                else:
                    self.status_icon.set_from_icon_name("emblem-ok-symbolic")
                    self.status.set_text("Ready")
                    self.action.remove_css_class("destructive-action")
                    self.action.add_css_class("suggested-action")
                self.action.set_sensitive(active or bool(self.outputs and self.microphones))
            except AudioError as exc:
                self.set_error(str(exc))
                self.action.set_sensitive(False)

        def on_action(self, _button: Gtk.Button) -> None:
            self.action.set_sensitive(False)
            while GLib.MainContext.default().iteration(False):
                pass
            try:
                if self.router.active_state() is not None:
                    self.router.stop()
                else:
                    output_index = self.output_dropdown.get_selected()
                    mic_index = self.mic_dropdown.get_selected()
                    if output_index >= len(self.outputs) or mic_index >= len(self.microphones):
                        raise AudioError("Choose an output and a microphone first.")
                    self.router.start(
                        self.outputs[output_index].name,
                        self.microphones[mic_index].name,
                        self.mix_switch.get_active(),
                    )
                self.refresh()
            except AudioError as exc:
                self.set_error(str(exc))
                self.action.set_sensitive(True)

    return ScreenBridgeApplication().run([])


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Easy Ubuntu system-audio sharing")
    subparsers = parser.add_subparsers(dest="command")
    subparsers.add_parser("list", help="list playback devices and microphones")
    start = subparsers.add_parser("start", help="start an audio sharing session")
    start.add_argument("--output", required=True, help="pactl sink name")
    start.add_argument("--microphone", required=True, help="pactl source name")
    start.add_argument("--mix-microphone", action="store_true", help="also create a combined input")
    subparsers.add_parser("stop", help="stop the active session and restore audio")
    subparsers.add_parser("status", help="show session status")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command is None:
        return run_gui()

    router = AudioRouter()
    try:
        router.ensure_available()
        if args.command == "list":
            print("Outputs:")
            for device in router.outputs():
                print(f"  {device.name}\t{device.description}")
            print("Microphones:")
            for device in router.microphones():
                print(f"  {device.name}\t{device.description}")
        elif args.command == "start":
            router.start(args.output, args.microphone, args.mix_microphone)
            print("ScreenBridge audio sharing started.")
        elif args.command == "stop":
            router.stop()
            print("ScreenBridge audio sharing stopped.")
        elif args.command == "status":
            state = router.active_state()
            print("active" if state else "inactive")
        return 0
    except AudioError as exc:
        print(f"screenbridge: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
