Amber Radiance 1 Control Interface
==================================

Unofficial Node.js API for controlling Raytheon/Amber Radiance 1 IR Cameras.

Features:
 * Getting camera status
 * Changing brightness / contrast
 * Running calibrations
 * Toggling cryo cooler
 * Changing automatic gain control (AGC) modes
 * Changing intensity transform table (ITT) modes
 * Changing look-up table (LUT) modes
 * Changing non-uniformity correction (NUC) modes

##### Contents

- [Background](#background)
- [Requirements](#requirements)
- [Installation](#installation)
- [Examples](#usage--examples)
- [API Docs](#api-docs)
- [License](#license)

Background
----------

The Radiance 1 Infrared camera was developed by Amber Engineering, a engineering company started in 1981 and purchased in 1992 by Raytheon Missile Systems. Rebranded to Raytheon Amber, they released this camera around 1993.

![Amber Radiance 1 Camera](/docs/jpl-amber-1.jpg?raw=true)

(Pictured: NASA Spinoff camera based on an Amber Radiance 1. Image credit: [NASA](https://spinoff.nasa.gov/spinoff2002/ps_3.html))

In 1998, Raytheon Amber closed shop and merged with Hughes Defense, after which much of the tools and documentation for their cameras became more difficult to find.

Many of these cameras still exist and can provide impressive IR imaging, albeit in a relatively low resolution, but the software required to control it is long obsolete and requires a license that can no longer be obtained. Some of the functionality has been reverse-engineered and included in this library so others may breathe new life into these devices. 

For more background stories on these cameras, see [Fraser's Quest on EEVblog](https://www.eevblog.com/forum/thermal-imaging/the-story-of-a-radiance-1-camera-and-frasers-quest-to-find-information-on-it/).

Requirements
------------

 * Node.js 20+

Installation
------------

```
npm install @appliedminds/amber-radiance-1
```

Usage / Examples
----------------

### Via Serial

```
import { Camera } from '@appliedminds/amber-radiance-1'

const camera = new Camera({ port: '/dev/tty21', transport: 'serial' })
await camera.connect()

// Set NUC mode
await device.setNUC('warm')

// Set LUT mode
await device.setLUT('black-and-white')

// Turn off Cryo Cooler
await device.setCooler(false)
```

### Via TCP

This assumes you're using some sort of RS-232/TCP pass-through device, such as a [Moxa NPort](https://www.moxa.com/en/products/industrial-edge-connectivity/serial-device-servers/general-device-servers/nport-5200-series)

```
import { Camera } from '@appliedminds/amber-radiance-1'

const camera = new Camera({ host: '192.168.100.50', port: 4001, transport: 'tcp' })
await camera.connect()

// Get power and cooler cycles
console.log(await camera.getStatus())
```

API Docs
--------

### `new Camera({ port : String/Number, host?: String, verbose?: Boolean, transport?: String })`

Constructor

  * `port`:
    * When `transport` set to `tcp`: TCP port
    * When `transport` set to `serial`: Qualified path on MacOS/Linux (E.G. `/dev/some/device/path`), COM port on Windows (E.G. `COM3`)
  * `host`: Host or IP address to connect to (only when `transport` set to `tcp`)
  * `verbose`: Print additional debug logs
  * `transport`: Method to connect to device (`serial` or `tcp`) (default: `tcp`)

### `camera.close()` : `<Promise>`

Manually close connection. Resolves once the connection has been closed.

### `camera.connect()` : `<Promise>`

Connect to camera. The returned promise will resolve once connected.

### `camera.getAGC()` : `<Promise<Boolean>>`

Check if Automatic Gain Control is turned off or on.

### `camera.getITT()` : `<Promise<String>>`

Return active intensity transform table mode (`linear`, `inverse`, `s-curve` or `two-cycle`)

### `camera.getLUT()` : `<Promise<String>>`

Return active look-up table mode (`black-and-white`, `color` or `sepia`)

### `camera.getNUC()` : `<Promise<String>>`

Return active non-uniformity correction mode (`cold`, `mid`, `warm` or `hot`)

### `camera.getStatus()` : `<Promise<Object>>`

Return camera status information. Resolves to an object containing the following keys:

  * `numCoolerCycles`: Number of times the cryo cooler has been cycled
  * `numPowerCycles`: Number of times the device power has been cycled
  * `coolerTime`: A timestamp indicating cooler time, although it's unclear how this is supposed to be interpreted.

### `camera.invertImage()` : `<Promise>`

Vertically invert the output image.

### `camera.run1PointCalibration()` : `<Promise>`

Initiate the single point calibration process for the current NUC mode.

### `camera.run2PointCalibration()` : `<Promise>`

Initiate the two-point calibration process for the current NUC mode.

### `camera.setBrightness(delta : Number)` : `<Promise>`

Change relative brightness

 * `delta`: Increase brightness when > 0, otherwise decrease

### `camera.setCooler(enabled : Boolean)` : `<Promise>`

Toggle cryo cooler operation.

### `camera.setContrast(delta : Number)` : `<Promise>`

Change relative contrast

 * `delta`: Increase contrast when > 0, otherwise decrease

### `camera.setAGC(mode : String)` : `<Promise>`

Set automatic gain control mode

 * `mode`: Set AGC to `full`, `midsize`, `center`, `horizon` or `off` to turn off.

### `camera.setITT(mode : String)` : `<Promise>`

Set intensity transform table used for transforming the output values for display.

 * `mode`: `linear`, `inverse`, `s-curve`, or `two-cycle`

### `camera.setLUT(mode : String)` : `<Promise>`

Set the look-up table used for coloring the output image.

 * `mode`: `black-and-white`, `color` or `sepia`

### `camera.setNUC(mode : String)` : `<Promise>`

Set current non-uniformity correction mode.

 * `mode`: `cold`, `mid`, `warm` or `hot`

### `camera.toggleColorBar(enabled : Boolean)` : `<Promise>`

Toggle the on-screen color bar legend on or off.

### `camera.toggleFreezeFrame()` : `<Promise>`

Toggle freeze frame mode.

### `camera.toggleOSD(enabled : Boolean)` : `<Promise>`

Show or hide the on-screen display sidebar.

License
-------

Unless otherwise specified, all content, including all source code files and documentation files in this repository are:

Copyright (c) 2024 Applied Minds LLC

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at:

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
