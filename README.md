# Aqara-T1-LED-Strip
Zigbee2MQTT external converter for Aqara T1 LED Strip with segment control and dynamic effects

In static mode individual strip segments of 20cm can each be set to unique colors or turned off. These can be defined and activated through a Home Assistant blueprint.

Dynamic RGB Effect patterns can be created and activated via Home Assistant having the following properties:

*Effect Type:*
Breathing, Rainbow1, Chasing, Flash, Hopping, Rainbow2, Flicker, Dash

*Speed:* 1% - 100%

*Colors:* Between 1 and 8 colors can be set for each effect.

*Effect segments:* The segments of the strip the dynamic effects are active in

## Installation

*Requires Zigbee2MQTT 2.7.0 or above*

In Zigbee2MQTT go to **settings** → **dev console** → **external converters**, create a new converter named **t1-strip.mjs** and paste in the contents of the file. Click save then restart Zigbee2MQTT via **settings** → **tools**

Alternatively place the file **t1-strip.mjs** in the folder **zigbee2mqtt/data/external_converters** and restart Zigbee2MQTT.

If an external converter is active for a device a cyan icon with "Supported: external" will be displayed under the device name in Zigbee2MQTT.

## Home Assistant
The Home Assistant folder contains a collection of blueprints, scripts, cards and examples to control the T1 LED Strip light with color segmentations and dynamic effects.

## Segment Color Patterns
### aqara_t1_strip_segments_blueprint.yaml
Home Assistant script blueprint to control individual strip light segments.

#### 1. Import the Blueprint
1. In Home Assistant, go to **Settings** → **Automations & Scenes** → **Blueprints**
2. Click the **Import Blueprint** button
3. Paste the URL to this blueprint file or upload it directly
4. Click **Preview** and then **Import**

#### 2. Create a Script from the Blueprint
1. Go to **Settings** → **Automations & Scenes** → **Scripts**
2. Click **Add Script** → **Create new script from blueprint**
3. Select **Aqara T1 LED Strip - Segment Colors Script**
4. Configure the script:
   - **Name**: Give it a descriptive name (e.g., "T1M Custom Ring Pattern")
   - **Target Lights**: Select one or more T1 LED Strip target enitities/devices, (e.g., light.my_led_strip)
   - **Zigbee2MQTT Base Topic**: Only needs to be changed if you have a non-standard Zigbee2MQTT installation
   - **Strip Length**: Select the Home Assistant entity representing the strip's length, (e.g., Length>>T1 LED Strip)
   - **Brightness**: Set the brightness to use for the color pattern
   - **Color Pickers**: Configure each of the segment colors up to the length of the strip. 000 (black) turns off a segment
5. Save the script

#### 3. Running a created script
Once created, you can run a script in several ways:

1. **Manually**: Go to **Settings** → **Automations & Scenes** → **Scripts** and run it
2. **Dashboard Button**: Add a script button to your dashboard
3. **Automation**: Trigger it from an automation

### aqara_t1_strip_gradient_blueprint.yaml
Home Assistant script blueprint to create color gradients evenly across the LED strip.

#### 1. Import the Blueprint
1. In Home Assistant, go to **Settings** → **Automations & Scenes** → **Blueprints**
2. Click the **Import Blueprint** button
3. Paste the URL to this blueprint file or upload it directly
4. Click **Preview** and then **Import**

#### 2. Create a Script from the Blueprint
1. Go to **Settings** → **Automations & Scenes** → **Scripts**
2. Click **Add Script** → **Create new script from blueprint**
3. Select **Aqara T1 LED Strip - Gradient Colors Script**
4. Configure the script:
   - **Name**: Give it a descriptive name (e.g., "T1M Custom Ring Pattern")
   - **Target Lights**: Select one or more T1 LED Strip target enitities/devices, (e.g., light.my_led_strip)
   - **Zigbee2MQTT Base Topic**: Only needs to be changed if you have a non-standard Zigbee2MQTT installation
   - **Strip Length**: Select the Home Assistant entity representing the strip's length, (e.g., Length>>T1 LED Strip)
   - **Brightness**: Set the brightness to use for the color pattern
   - **Use Gradient**: If selected the colors will create a gradient between them over the strip length, if not selected solid color blocks will be created over the strip length
   - **Color Pickers**: Configure each number of colors up specified above
5. Save the script

#### 3. Running a created script
Once created, you can run a script in several ways:

1. **Manually**: Go to **Settings** → **Automations & Scenes** → **Scripts** and run it
2. **Dashboard Button**: Add a script button to your dashboard
3. **Automation**: Trigger it from an automation

## Dynamic Effect Patterns

### aqara_t1_strip_rgb_effects_blueprint.yaml
Home Assistant script blueprint for custom RGB ring light dynamic effects.

#### 1. Import the Blueprint
1. In Home Assistant, go to **Settings** → **Automations & Scenes** → **Blueprints**
2. Click the **Import Blueprint** button
3. Paste the URL to this blueprint file or upload it directly to blueprints/script/aqara/aqara_t1_strip_rgb_effects_blueprint.yaml
4. Click **Preview** and then **Import**

#### 2. Create a Script from the Blueprint
1. Go to **Settings** → **Automations & Scenes** → **Scripts**
2. Click **Add Script** → **Create new script from blueprint**
3. Select **Aqara T1 Strip - RGB Ring Effect Script**
4. Configure the script:
   - **Name**: Give it a descriptive name (e.g., "T1 Custom Ring Pattern")
   - **Target Lights**: Select one or more T1 Strip enitities/devices, (e.g., light.my_t1_strip)
   - **Zigbee2MQTT Base Topic**: Only needs to be changed if you have a non-standard Zigbee2MQTT installation
   - **RGB Effect**: Select the dynamic effect to use
   - **Effect Segments**: A comma seperated list of segments to use for the effect, (e.g. 1,3,5,10)
   - **Number of colors**: Set the number of color pickers the effect pattern will use
   - **Color Pickers**: Configure the number of color pickers selected in the step above.
   - **Effect Speed**: Percentage between 1 and 100
5. Save the script

#### 3. Running a created script
Once created, you can run a script in several ways:

1. **Manually**: Go to **Settings** → **Automations & Scenes** → **Scripts** and run it
2. **Dashboard Button**: Add a script button to your dashboard
3. **Automation**: Trigger it from an automation
