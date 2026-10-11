# ScreenBridge 1.0 “Aurora”

Share the sound from your Linux computer during calls, presentations, recordings, and streams—with one button.

ScreenBridge keeps sound playing through your speakers or headphones and leaves your microphone under your control.

## Install

On Ubuntu, open **Terminal**, paste this command, and press Enter:

```bash
curl -fsSL -o /var/tmp/screenbridge-install.sh https://packages.elixpo.com/screenbridge/install.sh && bash /var/tmp/screenbridge-install.sh
```

This adds the signed Elixpo package repository, installs ScreenBridge, and lets normal system updates deliver future releases. When it finishes, open **ScreenBridge** from the applications menu.

## Use

1. Choose your speakers or headphones under **Listen on**.
2. Choose your microphone.
3. Press **Start sharing audio**.

In your call or recording app, select **Screen Share Audio** as the audio input.

Turn on **Share microphone too** when an app allows only one audio input. Then choose **Screen Share Audio + Microphone** in that app.

Press **Stop sharing audio** when you are finished. Your usual sound setup is restored automatically.

## Supported systems

ScreenBridge is made for Ubuntu 22.04 and newer. It also works on many Ubuntu-based distributions that use PipeWire or PulseAudio.

## Remove

Open Terminal and run:

```bash
sudo apt remove screenbridge
```

## A small Linux limitation

Some calling apps accept only one audio input. For those apps, use the **Share microphone too** switch. Apps that support multiple inputs can keep computer sound and microphone sound separate.

ScreenBridge is free and open source under the MIT License.
