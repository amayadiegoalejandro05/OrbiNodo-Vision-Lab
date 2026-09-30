#include <WiFi.h>
#include <WebServer.h>

#include "secrets.h"

const char* HOSTNAME = "phylo-access-actuator";

WebServer server(80);

enum ActuatorState {
  CLOSED,
  OPENING,
  OPEN_HOLD,
  CLOSING
};

const unsigned long OPENING_MS = 500;
const unsigned long OPEN_HOLD_MS = 3000;
const unsigned long CLOSING_MS = 500;

ActuatorState state = CLOSED;
unsigned long stateStartedAt = 0;

const char* stateName() {
  switch (state) {
    case CLOSED: return "CLOSED";
    case OPENING: return "OPENING";
    case OPEN_HOLD: return "OPEN_HOLD";
    case CLOSING: return "CLOSING";
  }
  return "CLOSED";
}

void updateState() {
  const unsigned long now = millis();

  while (state != CLOSED) {
    unsigned long duration;
    ActuatorState nextState;

    switch (state) {
      case OPENING:
        duration = OPENING_MS;
        nextState = OPEN_HOLD;
        break;
      case OPEN_HOLD:
        duration = OPEN_HOLD_MS;
        nextState = CLOSING;
        break;
      case CLOSING:
        duration = CLOSING_MS;
        nextState = CLOSED;
        break;
      default:
        return;
    }

    if (now - stateStartedAt < duration) {
      break;
    }

    stateStartedAt += duration;
    state = nextState;
  }
}

void handleHealth() {
  server.send(
    200,
    "application/json",
    "{\"status\":\"ok\",\"device\":\"phylo-access-actuator\",\"transport\":\"wifi-http\"}"
  );
}

void handleStatus() {
  server.send(200, "application/json", String("{\"state\":\"") + stateName() + "\"}");
}

void handleOpen() {
  if (state != CLOSED) {
    server.send(409, "application/json", String("{\"accepted\":false,\"state\":\"") + stateName() + "\"}");
    return;
  }

  state = OPENING;
  stateStartedAt = millis();
  server.send(202, "application/json", "{\"accepted\":true,\"state\":\"OPENING\"}");
}

void setup() {
  Serial.begin(115200);

  WiFi.setHostname(HOSTNAME);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }

  Serial.print("IP: ");
  Serial.println(WiFi.localIP());

  server.on("/health", HTTP_GET, handleHealth);
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/open", HTTP_POST, handleOpen);
  server.begin();
}

void loop() {
  updateState();
  server.handleClient();
}
