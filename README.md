# Aqara-T1-LED-Strip
Zigbee2MQTT external converter for Aqara T1 LED Strip with segment control and dynamic effects

## Installation

*Requires Zigbee2MQTT 2.7.0 or above*

In Zigbee2MQTT go to **settings** → **dev console** → **external converters**, create a new converter named **t1-strip.mjs** and paste in the contents of the file. Click save then restart Zigbee2MQTT via **settings** → **tools**

Alternatively place the file **t1-strip.mjs** in the folder **zigbee2mqtt/data/external_converters** and restart Zigbee2MQTT.

If an external converter is active for a device a cyan icon with "Supported: external" will be displayed under the device name in Zigbee2MQTT.
