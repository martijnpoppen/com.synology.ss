# Surveillance Station

Adds support to Homey for Camera's available in Synology Surveillance Station.

## Features

### Camera
* Native homey camera support
* Supports all camera's available in Surveillance Station

#### motion detection
* Enable/disable motion detection when installing device and in advanced camera settings
* Motion detection pushed by Surveillance Station

#### flows
* Action to update camera image. This can be used in doorbell flows.
* Actions for recording (start / stop).

### Surveillance Station

#### flows
* Actions to manage the Home Mode.
* Triggers for Home Mode (enabled / disabled)

## Getting Started
* Install the app on Homey
* Add a device
* Select the Camera or Surveillance Station
* Provide the credentials to your Synology
* Select your device
* Done!

## Reconnect/Repair your device
* Go to the devices settings, choose "Maintenance actions" and then "Repair".

## Tested with
* DSM 6.2.2-24922 Update 4
* Surveillance Station 8.2.6-6009
* Homey 3.2.0+

## Troubleshooting
* Problem: When your Synology reboots, the connection is lost with your device.
* Solution: Go to the devices settings, choose "Maintenance actions" and then "Repair".

## Note
* this app is not officially maintained by Synology.
