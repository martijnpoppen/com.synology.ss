# Surveillance Station

Adds support to Homey for Camera's available in Synology Surveillance Station.

## Features

#### camera's
* Native homey camera support
* Supports all camera's available in Surveillance Station

#### motion detection
* Enable/disable motion detection when installing device and in advanced camera settings
* Motion detection pushed by Surveillance Station

#### flows
* Action to update camera image. This can be used in doorbell flows.
* Actions to manager the Home Mode (only for Surveillance Station).

## Getting Started
* Install the app on Homey
* Add a device
* Provide the credentials to your Synology
* Enable motion detection (optional)
* Select your camera
* Done!

## Tested with
* DSM 6.2.2-24922 Update 4
* Surveillance Station 8.2.6-6009
* Homey 3.2.0+

## Troubleshooting

#### Session/Connection is lost
* Problem: When your Synology is rebooted all sessions are gone.
* Solution: Go to the devices settings/maintenance and try to repair.
