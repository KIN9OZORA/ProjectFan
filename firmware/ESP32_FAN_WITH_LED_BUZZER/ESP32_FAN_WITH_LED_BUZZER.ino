#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <DFRobot_SHT3x.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "esp_system.h"
#include <Preferences.h>

// =======================
// WIFI CONFIG
// =======================
const char* ssid = "IOT-WIFI";
const char* password = "11223344";

// =======================
// MQTT CONFIG
// =======================
const char* mqtt_server = "145.79.15.108";
const int mqtt_port = 1883;

// =======================
// DEVICE CONFIG
// =======================
String deviceId = "FAN-002";
String topicTelemetry = "device/FAN-002/telemetry";
String topicCommand   = "device/FAN-002/command";
String topicStatus    = "device/FAN-002/status";

// =======================
// PIN CONFIG
// =======================
#define FAN_PIN     26
#define BUZZER_PIN  27
#define LED_PIN1    32
#define LED_PIN2     4
#define LED_PIN3    33
#define SDA_PIN     21
#define SCL_PIN     22

// =======================
// OLED CONFIG
// =======================
#define SCREEN_WIDTH  128
#define SCREEN_HEIGHT  64
#define OLED_RESET     -1
#define OLED_ADDRESS 0x3C   // Ganti 0x3D jika tidak tampil

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// Relay logic
bool relayActiveLow = false;

// =======================
// OBJECTS
// =======================
DFRobot_SHT3x sht31(&Wire, 0x44);
WiFiClient espClient;
PubSubClient mqttClient(espClient);
Preferences preferences;

// =======================
// SENSOR VARIABLES
// =======================
float temperature = 0.0;
float humidity    = 0.0;
float lastTemp    = 0.0;
float lastHumidity = 0.0;

// =======================
// SYSTEM STATUS
// =======================
bool   fanStatus   = false;
bool   alarmStatus = false;
String mode        = "AUTO";

bool pendingRestart = false;
String pendingRestartReason = "";

// =======================
// AUTO SETPOINT
// =======================
float setpointOn  = 36.0;
float setpointOff = 35.0;

// =======================
// MANUAL CONTROL
// =======================
bool manualFanStatus   = false;
bool manualAlarmStatus = false;

unsigned long manualTimerSeconds   = 0;
unsigned long manualFanStartMillis = 0;
bool manualTimerActive    = false;
bool manualAlarmConfigured = false;

// =======================
// FAN RUNTIME
// =======================
unsigned long fanRuntimeSeconds   = 0;
unsigned long fanLastUpdateMillis = 0;

// =======================
// INTERVAL CONFIG
// =======================
unsigned long lastSensorRead   = 0;
unsigned long lastStatusPrint  = 0;
unsigned long lastMqttPublish  = 0;
unsigned long lastWifiCheck    = 0;
unsigned long lastMqttCheck    = 0;
unsigned long lastOledUpdate   = 0;

const unsigned long sensorInterval      = 2000;
const unsigned long printInterval       = 5000;
const unsigned long mqttPublishInterval = 5000;
const unsigned long wifiCheckInterval   = 5000;
const unsigned long mqttCheckInterval   = 5000;
const unsigned long oledUpdateInterval  = 1000;   // update OLED tiap 1 detik
const unsigned long oledPageInterval    = 4000;   // ganti halaman tiap 4 detik
const unsigned long buzzerBeepInterval  = 200;

// =======================
// OLED PAGE
// =======================
int  oledPage = 0;              // 0 = halaman utama, 1 = halaman status
unsigned long lastPageSwitch = 0;

// =======================
// AUTO RESTART CONFIG
// =======================
bool enableDailyRestart = true;
const unsigned long dailyRestartInterval    = 24UL * 60UL * 60UL * 1000UL;
const unsigned long wifiTroubleRestartTime  = 2UL  * 60UL * 1000UL;
const unsigned long mqttTroubleRestartTime  = 3UL  * 60UL * 1000UL;
const int maxPublishFailBeforeRestart = 5;

unsigned long wifiTroubleStartMillis = 0;
unsigned long mqttTroubleStartMillis = 0;
int mqttPublishFailCount = 0;
String lastTroubleReason = "none";

// =======================
// BUZZER
// =======================
unsigned long lastTransitionTime      = 0;
const unsigned long buzzerTransitionDuration = 2000;  // 2 DETIK
bool buzzerActive = false;

// =======================
// LED CONTROL & BLINKING
// =======================
// LED 32 (Green/Hijau) - Mode AUTO indicator
unsigned long lastLedGreenBlink = 0;
const unsigned long ledBlinkInterval = 500;  // Blink 500ms ON/OFF
bool ledGreenBlinkState = false;

// LED 33 (Yellow/Kuning) - Mode MANUAL & Timer indicator
unsigned long lastLedYellowBlink = 0;
bool ledYellowBlinkState = false;

// Tracking fan status untuk detect transisi (ON/OFF ke OFF/ON)
bool lastFanStatus = false;
bool fanTransitionDetected = false;

// =======================
// FORWARD DECLARATIONS
// =======================
void publishTelemetry();
void publishStatus(String status);
void cancelManualTimer();
void updateOLED();
void playBuzzer(int count, int duration);
void startBuzzerTransition();
void stopBuzzerTransition();
void updateBuzzerTransition();
void readSerialNonBlocking();
void loadSettingsFromNVS();
void saveSettingsToNVS();

// =======================
// BUZZER CONTROL
// =======================
void playBuzzer(int count, int duration) {
  for (int i = 0; i < count; i++) {
    digitalWrite(BUZZER_PIN, HIGH); delay(duration);
    digitalWrite(BUZZER_PIN, LOW);  delay(duration);
  }
}

void startBuzzerTransition() {
  buzzerActive = true;
  lastTransitionTime = millis();
  digitalWrite(BUZZER_PIN, HIGH);  // Active buzzer: langsung ON
  Serial.println("[BUZZER] TRANSITION START - 2 detik");
}

void stopBuzzerTransition() {
  if (buzzerActive) {
    digitalWrite(BUZZER_PIN, LOW);  // Active buzzer: OFF
    buzzerActive = false;
    Serial.println("[BUZZER] TRANSITION END");
  }
}

void updateBuzzerTransition() {
  if (!buzzerActive) return;
  
  // Check apakah sudah 2 detik, kalau ya stop buzzer
  if (millis() - lastTransitionTime >= buzzerTransitionDuration) {
    stopBuzzerTransition();
    return;
  }
}

// =======================
// LED CONTROL
// =======================
void setLED(int n, bool state) {
  if (n == 1) digitalWrite(LED_PIN1, state);
  else if (n == 2) digitalWrite(LED_PIN2, state);
  else if (n == 3) digitalWrite(LED_PIN3, state);
}

void setAllLED(bool state) {
  digitalWrite(LED_PIN1, state);
  digitalWrite(LED_PIN2, state);
  digitalWrite(LED_PIN3, state);
}

// =======================
// FAN CONTROL
// =======================
void setFan(bool state) {
  // Detect transisi fan status
  if (fanStatus != state) {
    fanTransitionDetected = true;
    startBuzzerTransition();  // BUZZER AKTIF saat transisi (ON->OFF atau OFF->ON)
  }
  
  fanStatus = state;
  digitalWrite(FAN_PIN, relayActiveLow ? !state : state);
  setLED(3, state);  // LED 4 (Red) - langsung ON/OFF sesuai fan status
}

// =======================
// CANCEL MANUAL TIMER
// =======================
void cancelManualTimer() {
  manualTimerActive     = false;
  manualFanStartMillis  = 0;
  manualAlarmConfigured = false;
}

// =======================
// FORMAT RUNTIME
// =======================
String formatRuntime(unsigned long totalSeconds) {
  char buf[12];
  sprintf(buf, "%02lu:%02lu:%02lu",
    totalSeconds / 3600,
    (totalSeconds % 3600) / 60,
    totalSeconds % 60);
  return String(buf);
}

unsigned long getManualRemainingSeconds() {
  if (!manualTimerActive || manualTimerSeconds == 0) return 0;
  unsigned long elapsed = (millis() - manualFanStartMillis) / 1000;
  return (elapsed >= manualTimerSeconds) ? 0 : manualTimerSeconds - elapsed;
}

// =======================
// NVS STORAGE (PERSISTENCE)
// =======================
void loadSettingsFromNVS() {
  preferences.begin("fan-settings", true);
  setpointOn  = preferences.getFloat("setpointOn", 36.0);
  setpointOff = preferences.getFloat("setpointOff", 35.0);
  String savedMode = preferences.getString("mode", "AUTO");
  if (savedMode == "AUTO" || savedMode == "MANUAL") mode = savedMode;
  preferences.end();
  Serial.printf("[NVS] Loaded: SP_ON=%.1f SP_OFF=%.1f Mode=%s\n", setpointOn, setpointOff, mode.c_str());
}

void saveSettingsToNVS() {
  preferences.begin("fan-settings", false);
  preferences.putFloat("setpointOn",  setpointOn);
  preferences.putFloat("setpointOff", setpointOff);
  preferences.putString("mode", mode);
  preferences.end();
  Serial.printf("[NVS] Saved: SP_ON=%.1f SP_OFF=%.1f Mode=%s\n", setpointOn, setpointOff, mode.c_str());
}

// =======================
// SAFE RESTART
// =======================
void safeRestart(String reason) {
  Serial.println("RESTARTING: " + reason);

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("RESTARTING...");
  display.println(reason);
  display.display();

  if (mqttClient.connected()) { publishStatus("restarting"); delay(500); }
  setFan(false);
  playBuzzer(3, 200);
  delay(1000);
  
  Serial.flush();
  WiFi.disconnect(true);
  delay(100);
  ESP.restart();
}

// =======================
// UPDATE OLED - 2 HALAMAN
// =======================
void updateOLED() {
  // Ganti halaman otomatis tiap 4 detik
  if (millis() - lastPageSwitch >= oledPageInterval) {
    lastPageSwitch = millis();
    oledPage = (oledPage + 1) % 2;
  }

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  if (oledPage == 0) {
    // =====================
    // HALAMAN 1: DATA UTAMA
    // =====================

    // --- TEMP: Font size 2 (12x16 per char) ---
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.print("TEMP:");

    display.setTextSize(2);
    display.setCursor(36, 0);
    char tempBuf[8];
    dtostrf(temperature, 4, 1, tempBuf);
    display.print(tempBuf);
    display.print("C");

    // --- Garis pemisah ---
    display.drawLine(0, 18, 128, 18, SSD1306_WHITE);

    // --- HUM: Font size 2 ---
    display.setTextSize(1);
    display.setCursor(0, 21);
    display.print("HUM: ");

    display.setTextSize(2);
    display.setCursor(36, 21);
    char humBuf[8];
    dtostrf(humidity, 4, 1, humBuf);
    display.print(humBuf);
    display.print("%");

    // --- Garis pemisah ---
    display.drawLine(0, 40, 128, 40, SSD1306_WHITE);

    // --- MODE / FAN / TIMER: Font size 1 ---
    display.setTextSize(1);

    // MODE
    display.setCursor(0, 43);
    display.print("MODE:");
    display.print(mode);

    // FAN
    display.setCursor(0, 53);
    display.print("FAN:");
    display.print(fanStatus ? "ON " : "OFF");
    display.print(" TIMER:");
    unsigned long rem = getManualRemainingSeconds();
    if (rem > 0) {
      display.print(rem);
      display.print("s");
    } else {
      display.print("--");
    }

  } else {
    // ========================
    // HALAMAN 2: STATUS DETAIL
    // ========================
    display.setTextSize(1);

    // Baris 0: SP ON / SP OFF
    display.setCursor(0, 0);
    display.print("SP-ON:");
    display.print(setpointOn, 1);
    display.print(" OFF:");
    display.print(setpointOff, 1);

    // Garis
    display.drawLine(0, 10, 128, 10, SSD1306_WHITE);

    // Baris 1: Alarm
    display.setCursor(0, 13);
    display.print("ALARM:");
    display.print(alarmStatus ? "ON " : "OFF");
    display.print(" M:");
    display.print(manualAlarmStatus ? "ON" : "OFF");

    // Baris 2: Runtime fan
    display.setCursor(0, 23);
    display.print("RUN: ");
    display.print(formatRuntime(fanRuntimeSeconds));

    // Baris 3: WiFi + MQTT
    display.setCursor(0, 33);
    display.print("WiFi:");
    display.print(WiFi.isConnected() ? "OK" : "XX");
    display.print(" MQTT:");
    display.print(mqttClient.connected() ? "OK" : "XX");

    // Baris 4: Uptime
    display.setCursor(0, 43);
    display.print("UP:");
    display.print(millis() / 1000);
    display.print("s");

    // Baris 5: Timer info
    display.setCursor(0, 53);
    display.print("TMR:");
    display.print(manualTimerSeconds);
    display.print("s ");
    display.print(manualTimerActive ? "ACT" : "---");
    display.print(" F:");
    display.print(mqttPublishFailCount);
  }

  display.display();
}

// =======================
// WIFI SETUP
// =======================
void setupWiFi() {
  Serial.println("Connecting to WiFi: " + String(ssid));

  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("WiFi Connecting...");
  display.println(ssid);
  display.display();

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  WiFi.begin(ssid, password);

  int retry = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500); Serial.print(".");
    retry++;
    if (retry > 60) safeRestart("WiFi gagal connect saat setup");
  }

  Serial.println("\nWiFi connected: " + WiFi.localIP().toString());

  display.clearDisplay();
  display.setCursor(0, 0);
  display.println("WiFi Connected!");
  display.println(WiFi.localIP().toString());
  display.display();
  delay(2000);
  wifiTroubleStartMillis = 0;
}

void checkWiFiHealth() {
  if (WiFi.status() == WL_CONNECTED) { wifiTroubleStartMillis = 0; return; }
  if (wifiTroubleStartMillis == 0) wifiTroubleStartMillis = millis();
  WiFi.reconnect();
  if (millis() - wifiTroubleStartMillis >= wifiTroubleRestartTime)
    safeRestart("WiFi putus > 2 menit");
}

// =======================
// READ SHT31 SENSOR
// =======================
void readSensor() {
  sht31.readTemperatureAndHumidity();
  float t = sht31.getTemperatureC();
  float h = sht31.getHumidityRH();
  if (isnan(h) || isnan(t)) { Serial.println("Gagal baca SHT31!"); return; }
  if (abs(t - lastTemp) > 0.1 || abs(h - lastHumidity) > 0.5) {
    temperature = t; humidity = h;
    lastTemp = t; lastHumidity = h;
    Serial.printf("SHT31 - Temp: %.1f C, Hum: %.1f %%\n", temperature, humidity);
  }
}

// =======================
// AUTO / MANUAL LOGIC
// =======================
void processAutoMode() {
  if (temperature >= setpointOn)  { setFan(true);  alarmStatus = true;  }
  if (temperature <= setpointOff) { setFan(false); alarmStatus = false; }
}

void processManualMode() {
  if (manualTimerActive && manualTimerSeconds > 0) {
    unsigned long elapsed = (millis() - manualFanStartMillis) / 1000;
    if (elapsed >= manualTimerSeconds) {
      manualTimerActive = false; manualFanStartMillis = 0; manualAlarmConfigured = false;
      if (manualAlarmStatus) { manualFanStatus = true;  setFan(true);  Serial.println("[TIMER] ALARM ON -> Fan HIDUP"); }
      else                   { manualFanStatus = false; setFan(false); Serial.println("[TIMER] ALARM OFF -> Fan MATI"); }
      startBuzzerTransition();
    }
  }
}

void processSystemLogic() {
  if (mode == "AUTO") processAutoMode();
  else processManualMode();
}

void updateFanRuntime() {
  if (fanStatus) {
    unsigned long elapsed = (millis() - fanLastUpdateMillis) / 1000;
    if (elapsed >= 1) { fanRuntimeSeconds += elapsed; fanLastUpdateMillis = millis(); }
  } else { fanLastUpdateMillis = millis(); }
}

// =======================
// UPDATE LED INDICATORS - DENGAN BLINKING
// =======================
void updateLEDIndicators() {
  // ========== LED 32 (GREEN/HIJAU) - Mode AUTO ==========
  if (mode == "AUTO") {
    // LED Hijau nyala di mode AUTO
    // Tapi KEDIP jika temperature melebihi setpoint (ON atau OFF)
    bool isOutsideSetpoint = (temperature >= setpointOn);
    
    if (isOutsideSetpoint) {
      // KEDIP: toggle setiap 500ms
      if (millis() - lastLedGreenBlink >= ledBlinkInterval) {
        lastLedGreenBlink = millis();
        ledGreenBlinkState = !ledGreenBlinkState;
      }
      setLED(1, ledGreenBlinkState);
    } else {
      // Tidak melebihi setpoint: LED nyala terus
      ledGreenBlinkState = true;
      setLED(1, true);
    }
  } else {
    // Mode MANUAL: LED Hijau mati
    setLED(1, false);
  }

  // ========== LED 33 (YELLOW/KUNING) - Mode MANUAL & Timer ==========
  if (mode == "MANUAL") {
    // LED Kuning nyala di mode MANUAL
    if (manualTimerActive) {
      // KEDIP saat timer aktif: toggle setiap 500ms
      if (millis() - lastLedYellowBlink >= ledBlinkInterval) {
        lastLedYellowBlink = millis();
        ledYellowBlinkState = !ledYellowBlinkState;
      }
      setLED(2, ledYellowBlinkState);
    } else {
      // Timer tidak aktif: LED nyala terus
      ledYellowBlinkState = true;
      setLED(2, true);
    }
  } else {
    // Mode AUTO: LED Kuning mati
    setLED(2, false);
  }

  // ========== LED 4 (RED/MERAH) - Fan Status ==========
  // Ini sudah di-handle di setFan() function
  // setLED(3, fanStatus) - nyala jika fan ON, mati jika fan OFF
}

// =======================
// MQTT
// =======================
void publishTelemetry() {
  if (!mqttClient.connected()) {
    if (++mqttPublishFailCount >= maxPublishFailBeforeRestart)
      safeRestart("MQTT publish gagal 5x");
    return;
  }
  StaticJsonDocument<512> doc;
  doc["device_id"]               = deviceId;
  doc["temperature"]             = temperature;
  doc["humidity"]                = humidity;
  doc["fan_status"]              = fanStatus;
  doc["alarm_status"]            = alarmStatus;
  doc["mode"]                    = mode;
  doc["setpoint_on"]             = setpointOn;
  doc["setpoint_off"]            = setpointOff;
  doc["fan_runtime"]             = fanRuntimeSeconds;
  doc["uptime"]                  = millis() / 1000;
  doc["manual_fan_status"]       = manualFanStatus;
  doc["manual_alarm_status"]     = manualAlarmStatus;
  doc["manual_timer_seconds"]    = (unsigned long)manualTimerSeconds;
  doc["manual_timer_active"]     = manualTimerActive;
  doc["timer_remaining_seconds"] = manualTimerActive ? getManualRemainingSeconds() : 0;

  char buf[384]; size_t n = serializeJson(doc, buf);
  if (mqttClient.publish(topicTelemetry.c_str(), buf, n)) {
    mqttPublishFailCount = 0;
    Serial.println("[MQTT] Telemetry published");
  } else {
    mqttPublishFailCount++;
    Serial.println("[MQTT] Publish failed");
  }
}

void publishStatus(String status) {
  if (!mqttClient.connected()) return;
  StaticJsonDocument<128> doc;
  doc["status"] = status; doc["uptime"] = millis() / 1000;
  char buf[128]; size_t n = serializeJson(doc, buf);
  mqttClient.publish(topicStatus.c_str(), buf, n);
  Serial.println("[MQTT] Status: " + status);
}

void handleMqttCommand(char* payload) {
  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, payload)) { Serial.println("JSON error"); return; }

  bool needNvsSave = false;

  if (doc.containsKey("command")) {
    String cmd = doc["command"].as<String>();
    cmd.toUpperCase();
    if (cmd == "RESTART_DEVICE") {
      pendingRestart = true;
      pendingRestartReason = "MQTT restart command";
    } else if (cmd == "RESET_RUNTIME") {
      fanRuntimeSeconds = 0;
      fanLastUpdateMillis = millis();
      cancelManualTimer();
      Serial.println("Runtime & timer di-reset via MQTT");
    } else if (cmd == "REQUEST_STATUS") {
      publishTelemetry();
    }
  }

  if (doc.containsKey("mode")) {
    String m = doc["mode"].as<String>(); m.toUpperCase();
    if (m == "AUTO" || m == "MANUAL") {
      if (mode != m) {
        mode = m; manualFanStatus = false; manualAlarmStatus = false;
        cancelManualTimer(); setFan(false);
        Serial.println("Mode -> " + mode);
        needNvsSave = true;
      }
    }
  }
  if (doc.containsKey("fan") && mode == "MANUAL") {
    bool f = doc["fan"].as<bool>();
    manualFanStatus = f; setFan(f); cancelManualTimer();
  }
  if (doc.containsKey("setpoint_on")) {
    float v = doc["setpoint_on"];
    if (v > setpointOff) { setpointOn = v; needNvsSave = true; }
  }
  if (doc.containsKey("setpoint_off")) {
    float v = doc["setpoint_off"];
    if (v < setpointOn) { setpointOff = v; needNvsSave = true; }
  }
  if (doc.containsKey("timer")) {
    manualTimerSeconds = doc["timer"].as<unsigned long>();
  }
  if (doc.containsKey("alarm")) {
    manualAlarmStatus = doc["alarm"].as<bool>();
    Serial.print("Manual Alarm = ");
    Serial.println(manualAlarmStatus ? "ON" : "OFF");
  }
  if (doc.containsKey("start_timer") && doc["start_timer"].as<bool>()
      && mode == "MANUAL" && manualTimerSeconds > 0) {
    manualTimerActive = true; manualAlarmConfigured = true;
    manualFanStartMillis = millis();
    if (manualAlarmStatus) { manualFanStatus = false; setFan(false); }
    else                   { manualFanStatus = true;  setFan(true);  }
  }

  if (needNvsSave) saveSettingsToNVS();

  processSystemLogic();
  publishTelemetry();
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  char msg[256]; memcpy(msg, payload, min(length, (unsigned int)255)); msg[length] = '\0';
  Serial.printf("[MQTT] Topic: %s | Msg: %s\n", topic, msg);
  if (strcmp(topic, topicCommand.c_str()) == 0) handleMqttCommand(msg);
}

void reconnectMQTTOnce() {
  Serial.println("Mencoba koneksi MQTT awal...");
  espClient.setTimeout(3); // Timeout 3 detik agar tidak ngehang lama
  String id = deviceId + "-" + String(random(0xffff), HEX);
  if (mqttClient.connect(id.c_str())) {
    mqttClient.subscribe(topicCommand.c_str());
    publishStatus("online");
    Serial.println("MQTT connected");
  } else {
    Serial.printf("MQTT failed rc=%d\n", mqttClient.state());
    // Tidak di-loop dan tidak direstart, biarkan masuk ke loop() 
    // agar sensor dan OLED tetap berjalan meski internet mati!
  }
}

unsigned long lastMqttReconnectAttempt = 0;
void checkMqttHealth() {
  if (!mqttClient.connected()) {
    // Hanya mencoba reconnect tiap 10 detik agar tidak memblokir loop terlalu sering
    if (millis() - lastMqttReconnectAttempt > 10000) {
      lastMqttReconnectAttempt = millis();
      Serial.println("Mencoba reconnect MQTT...");
      espClient.setTimeout(3);
      String id = deviceId + "-" + String(random(0xffff), HEX);
      if (mqttClient.connect(id.c_str())) {
        mqttClient.subscribe(topicCommand.c_str());
        mqttTroubleStartMillis = 0;
        Serial.println("MQTT reconnected");
        publishStatus("online");
      } else {
        if (mqttTroubleStartMillis == 0) mqttTroubleStartMillis = millis();
        // Hapus fungsi safeRestart jika MQTT putus, biarkan saja mencoba terus
        // agar kipas tetap bisa berputar otomatis walau internet mati total
      }
    }
  } else { 
    mqttTroubleStartMillis = 0; 
  }
}

// =======================
// SERIAL COMMANDS
// =======================
String serialCommandBuffer = "";

void readSerialNonBlocking() {
  while (Serial.available() > 0) {
    char c = Serial.read();
    if (c == '\n') {
      handleSerialCommand(serialCommandBuffer);
      serialCommandBuffer = "";
    } else if (c != '\r') {
      serialCommandBuffer += c;
    }
  }
}

void printStatus() {
  // Serial.println();
  // Serial.println("========================================");
  // Serial.println("SYSTEM STATUS");
  // Serial.println("========================================");
  // Serial.printf("Temperature       : %.1f C\n", temperature);
  // Serial.printf("Humidity          : %.1f %%\n", humidity);
  // Serial.println("Mode              : " + mode);
  // Serial.println("Alarm Status      : " + String(alarmStatus ? "ON" : "OFF"));
  // Serial.printf("Setpoint ON       : %.1f C\n", setpointOn);
  // Serial.printf("Setpoint OFF      : %.1f C\n", setpointOff);
  // Serial.println("Manual Fan Status : " + String(manualFanStatus ? "ON" : "OFF"));
  // Serial.println("Manual Alarm      : " + String(manualAlarmStatus ? "ON" : "OFF"));
  // Serial.printf("Timer Value       : %lu detik\n", manualTimerSeconds);
  // Serial.println("Timer Active      : " + String(manualTimerActive ? "YES" : "NO"));
  // Serial.println("Alarm Configured  : " + String(manualAlarmConfigured ? "YES" : "NO"));
  // Serial.printf("Timer Remaining   : %lu detik\n", getManualRemainingSeconds());
  // Serial.println("Total Fan Runtime : " + formatRuntime(fanRuntimeSeconds));
  // Serial.println("WiFi Status       : " + String(WiFi.isConnected() ? "Connected" : "Disconnected"));
  // Serial.println("MQTT Status       : " + String(mqttClient.connected() ? "Connected" : "Disconnected"));
  // Serial.println("Publish Fail Count: " + String(mqttPublishFailCount));
  // Serial.printf("Uptime            : %lu detik\n", millis() / 1000);
  // Serial.println("========================================");
}

void printHelp() {
  Serial.println();
  Serial.println("======= HELP =======");
  Serial.println("auto / manual");
  Serial.println("set on <val> / set off <val>");
  Serial.println("fan on / fan off");
  Serial.println("timer <detik>");
  Serial.println("start timer");
  Serial.println("alarm on / alarm off");
  Serial.println("reset runtime");
  Serial.println("publish / restart / status / help");
  Serial.println("====================");
}

void handleSerialCommand(String cmd) {
  cmd.trim(); cmd.toLowerCase();
  if (cmd.length() == 0) return;

  bool needNvsSave = false;

  if (cmd == "auto") {
    mode = "AUTO"; manualFanStatus = false; manualAlarmStatus = false;
    cancelManualTimer(); setFan(false); Serial.println("Mode -> AUTO");
    needNvsSave = true;
  }
  else if (cmd == "manual") {
    mode = "MANUAL"; manualFanStatus = false; manualAlarmStatus = false;
    cancelManualTimer(); setFan(false); alarmStatus = false; Serial.println("Mode -> MANUAL");
    needNvsSave = true;
  }
  else if (cmd.startsWith("set on ")) {
    float v = cmd.substring(7).toFloat();
    if (v > setpointOff) { setpointOn = v; Serial.printf("Setpoint ON = %.1f C\n", setpointOn); needNvsSave = true; }
    else Serial.println("Invalid: ON harus > OFF");
  }
  else if (cmd.startsWith("set off ")) {
    float v = cmd.substring(8).toFloat();
    if (v < setpointOn) { setpointOff = v; Serial.printf("Setpoint OFF = %.1f C\n", setpointOff); needNvsSave = true; }
    else Serial.println("Invalid: OFF harus < ON");
  }
  else if (cmd == "fan on") {
    if (mode == "MANUAL") { cancelManualTimer(); manualFanStatus = true; setFan(true); Serial.println("Fan ON"); }
    else Serial.println("Harus mode MANUAL");
  }
  else if (cmd == "fan off") {
    if (mode == "MANUAL") { cancelManualTimer(); manualFanStatus = false; setFan(false); Serial.println("Fan OFF"); }
    else Serial.println("Harus mode MANUAL");
  }
  else if (cmd.startsWith("timer ")) {
    float v = cmd.substring(6).toFloat();
    if (v >= 0) {
      manualTimerSeconds = (unsigned long)v;
      if (manualTimerSeconds == 0) cancelManualTimer();
      Serial.printf("Timer = %lu detik\n", manualTimerSeconds);
    }
  }
  else if (cmd == "start timer") {
    if (mode == "MANUAL" && manualTimerSeconds > 0) {
      manualTimerActive = true; manualAlarmConfigured = true;
      manualFanStartMillis = millis();
      if (manualAlarmStatus) { manualFanStatus = false; setFan(false); Serial.println("Timer START - ALARM ON"); }
      else                   { manualFanStatus = true;  setFan(true);  Serial.println("Timer START - ALARM OFF"); }
    } else Serial.println("Harus MANUAL + timer > 0");
  }
  else if (cmd == "alarm on") {
    if (mode == "MANUAL") { manualAlarmStatus = true; alarmStatus = true; Serial.println("Alarm ON"); }
  }
  else if (cmd == "alarm off") {
    if (mode == "MANUAL") { manualAlarmStatus = false; alarmStatus = false; Serial.println("Alarm OFF"); }
  }
  else if (cmd == "reset runtime") {
    fanRuntimeSeconds = 0; fanLastUpdateMillis = millis(); cancelManualTimer();
    Serial.println("Runtime & timer di-reset");
  }
  else if (cmd == "publish") publishTelemetry();
  else if (cmd == "restart")  safeRestart("Serial restart command");
  else if (cmd == "status")   printStatus();
  else if (cmd == "help")     printHelp();
  else { Serial.println("Command tidak dikenal. Ketik 'help'"); return; }

  if (needNvsSave) saveSettingsToNVS();

  processSystemLogic();
  publishTelemetry();
}

// =======================
// SETUP
// =======================
void setup() {
  Serial.begin(115200);
  loadSettingsFromNVS();

  pinMode(FAN_PIN,    OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN1,   OUTPUT);
  pinMode(LED_PIN2,   OUTPUT);
  pinMode(LED_PIN3,   OUTPUT);

  setFan(false); setAllLED(false);
  digitalWrite(BUZZER_PIN, LOW);
  delay(500);

  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(400000);

  // Init OLED
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS)) {
    Serial.println("OLED tidak ditemukan! Cek wiring atau ganti address 0x3D");
    // Lanjut tanpa OLED agar tidak hang
  } else {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.println("ESP32 Fan Control");
    display.setCursor(0, 16);
    display.println("SHT31 + OLED");
    display.setCursor(0, 32);
    display.println("Initializing...");
    display.display();
    Serial.println("OLED initialized OK");
  }

  // Init SHT31
  Serial.println("Initializing SHT31...");
  if (sht31.begin() != 0) {
    Serial.println("ERROR: SHT31 tidak ditemukan!");
    display.clearDisplay();
    display.setCursor(0, 0);
    display.println("SHT31 ERROR!");
    display.println("Check wiring...");
    display.display();
    while (1) { playBuzzer(3, 100); delay(500); }
  }
  Serial.println("SHT31 OK");

  printHelp();
  setupWiFi();

  mqttClient.setServer(mqtt_server, mqtt_port);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(1024);
  mqttClient.setKeepAlive(30);
  mqttClient.setSocketTimeout(5);

  reconnectMQTTOnce();

  playBuzzer(1, 200);
  lastPageSwitch = millis();
  Serial.println("Setup complete! System ready.");
}

// =======================
// LOOP
// =======================
void loop() {
  unsigned long now = millis();

  if (enableDailyRestart && now >= dailyRestartInterval)
    safeRestart("Daily restart 24 jam");

  if (pendingRestart) {
    pendingRestart = false;
    safeRestart(pendingRestartReason);
  }

  // Baca command dari Serial Monitor secara non-blocking
  readSerialNonBlocking();

  updateBuzzerTransition();

  if (now - lastWifiCheck >= wifiCheckInterval) {
    lastWifiCheck = now; checkWiFiHealth();
  }
  if (now - lastMqttCheck >= mqttCheckInterval) {
    lastMqttCheck = now; checkMqttHealth();
  }
  if (mqttClient.connected()) mqttClient.loop();

  if (now - lastSensorRead >= sensorInterval) {
    lastSensorRead = now; readSensor();
  }

  processSystemLogic();
  updateLEDIndicators();
  updateFanRuntime();

  // Update OLED tiap 1 detik
  if (now - lastOledUpdate >= oledUpdateInterval) {
    lastOledUpdate = now; updateOLED();
  }

  if (now - lastMqttPublish >= mqttPublishInterval) {
    lastMqttPublish = now; publishTelemetry();
  }
  if (now - lastStatusPrint >= printInterval) {
    lastStatusPrint = now; printStatus();
  }
}