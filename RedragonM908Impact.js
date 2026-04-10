// Redragon M908 Impact - SignalRGB Plugin
// USB protocol reverse-engineered by https://github.com/dokutan/mouse_m908
//
// The M908 uses HID Feature Reports on USB Interface 2 to control settings.
// It has a single LED zone (whole mouse body). Colors are written by sending
// a settings transaction: open packet -> setting packets -> close packet.
//
// NOTE: This plugin will conflict with the official Redragon software.
// Close it before using SignalRGB.

export function Name() { return "Redragon M908 Impact"; }
export function VendorId() { return 0x04d9; }
export function ProductId() { return 0xfc4d; }
export function Publisher() { return "Community"; }
export function Size() { return [3, 3]; }
export function Type() { return "Hid"; }
export function DefaultPosition() { return [225, 120]; }
export function DefaultScale() { return 8.0; }

export function ConflictingProcesses() {
	return ["RedragonSoftware.exe", "Redragon.exe"];
}

export function ControllableParameters() {
	return [
		{"property":"shutdownColor", "group":"lighting", "label":"Shutdown Color",
		 "min":"0", "max":"360", "type":"color", "default":"009bde"},
		{"property":"LightingMode", "group":"lighting", "label":"Lighting Mode",
		 "type":"combobox", "values":["Canvas", "Forced"], "default":"Canvas"},
		{"property":"forcedColor", "group":"lighting", "label":"Forced Color",
		 "min":"0", "max":"360", "type":"color", "default":"009bde"},
		{"property":"Brightness", "group":"lighting", "label":"Brightness",
		 "type":"combobox", "values":["Low", "Medium", "High"], "default":"High"},
	];
}

var vLedNames = ["Mouse Body"];
var vLedPositions = [[1, 1]];

export function LedNames() { return vLedNames; }
export function LedPositions() { return vLedPositions; }

// Track last sent color to avoid redundant USB writes
var lastR = -1;
var lastG = -1;
var lastB = -1;
var lastBrightness = "";

export function Initialize() {
	lastR = -1;
	lastG = -1;
	lastB = -1;
	lastBrightness = "";
	device.log("Redragon M908 Impact initialized");
}

export function Render() {
	var col;

	if (LightingMode === "Forced") {
		col = hexToRgb(forcedColor);
	} else {
		col = device.color(1, 1);
	}

	var r = col[0];
	var g = col[1];
	var b = col[2];

	if (r !== lastR || g !== lastG || b !== lastB || Brightness !== lastBrightness) {
		setMouseColor(r, g, b);
		lastR = r;
		lastG = g;
		lastB = b;
		lastBrightness = Brightness;
	}

	device.pause(10);
}

export function Shutdown(SystemSuspending) {
	var col;

	if (SystemSuspending) {
		col = [0, 0, 0];
	} else {
		col = hexToRgb(shutdownColor);
	}

	setMouseColor(col[0], col[1], col[2]);
}

export function Validate(endpoint) {
	return endpoint.interface === 2;
}

// ============================================================
// M908 USB Protocol
// Reference: https://github.com/dokutan/mouse_m908
//
// Communication: HID Feature Reports (SET_REPORT) on interface 2
// Report ID: 0x02 (16-byte packets), 0x03 (64-byte packets)
// Transaction: open (02 F5 00) -> data (02 F3 ...) -> close (02 F5 01)
//
// LED color packets per profile (5 profiles):
//   Address   | Byte layout
//   49 04     | [02 F3 49 04 06 00 00 00] [R] [G] [B] [mode0] [speed] [mode1] [00 00]
//   51 04     | same for profile 2
//   59 04     | same for profile 3
//   61 04     | same for profile 4
//   69 04     | same for profile 5
//
// Brightness packets per profile:
//   4F 04     | [02 F3 4F 04 01 00 00 00] [brightness] [00 ...]
//   57 04, 5F 04, 67 04, 6F 04 for profiles 2-5
//
// Static lightmode: mode0=0x01, mode1=0x02
// Brightness: 0x01=Low, 0x02=Medium, 0x03=High
// ============================================================

// Profile color packet addresses [byte2, byte3]
var colorAddresses = [
	[0x49, 0x04], // Profile 1
	[0x51, 0x04], // Profile 2
	[0x59, 0x04], // Profile 3
	[0x61, 0x04], // Profile 4
	[0x69, 0x04], // Profile 5
];

// Profile brightness packet addresses [byte2, byte3]
var brightnessAddresses = [
	[0x4f, 0x04], // Profile 1
	[0x57, 0x04], // Profile 2
	[0x5f, 0x04], // Profile 3
	[0x67, 0x04], // Profile 4
	[0x6f, 0x04], // Profile 5
];

function getBrightnessValue() {
	if (Brightness === "Low") { return 0x01; }
	if (Brightness === "Medium") { return 0x02; }
	return 0x03; // High (default)
}

function setMouseColor(r, g, b) {
	var brightnessVal = getBrightnessValue();

	// Open settings transaction
	device.send_report(
		[0x02, 0xf5, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
		 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], 16
	);
	device.pause(1);

	// Preamble packets (addresses 3E 00 and 46 04 from default settings)
	device.send_report(
		[0x02, 0xf3, 0x3e, 0x00, 0x02, 0x00, 0x00, 0x00,
		 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], 16
	);
	device.pause(1);

	device.send_report(
		[0x02, 0xf3, 0x46, 0x04, 0x02, 0x00, 0x00, 0x00,
		 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], 16
	);
	device.pause(1);

	// Set color and brightness for all 5 profiles
	for (var i = 0; i < 5; i++) {
		// Color + lightmode packet
		device.send_report([
			0x02, 0xf3, colorAddresses[i][0], colorAddresses[i][1],
			0x06, 0x00, 0x00, 0x00,
			r, g, b,
			0x01,  // lightmode byte 0 (static)
			0x08,  // speed (irrelevant for static, 0x08 = slowest)
			0x02,  // lightmode byte 1 (static)
			0x00, 0x00
		], 16);
		device.pause(1);

		// Brightness packet
		device.send_report([
			0x02, 0xf3, brightnessAddresses[i][0], brightnessAddresses[i][1],
			0x01, 0x00, 0x00, 0x00,
			brightnessVal,
			0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
		], 16);
		device.pause(1);
	}

	// Report rate packets (preserve defaults: 500Hz for all profiles)
	device.send_report(
		[0x02, 0xf3, 0x32, 0x00, 0x06, 0x00, 0x00, 0x00,
		 0x02, 0x00, 0x02, 0x00, 0x02, 0x00, 0x00, 0x00], 16
	);
	device.pause(1);

	device.send_report(
		[0x02, 0xf3, 0x38, 0x00, 0x04, 0x00, 0x00, 0x00,
		 0x02, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00], 16
	);
	device.pause(1);

	// Close settings transaction (applies changes)
	device.send_report(
		[0x02, 0xf5, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00,
		 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], 16
	);
	device.pause(5);
}

function hexToRgb(hex) {
	var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	var colors = [];
	colors[0] = parseInt(result[1], 16);
	colors[1] = parseInt(result[2], 16);
	colors[2] = parseInt(result[3], 16);
	return colors;
}
