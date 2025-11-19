import { LOGIN_URL } from "@/api/auth";
import { IconBtn } from "@/components/ui/IconBtn";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Modal, Text, View } from "react-native";
import { WebView } from "react-native-webview";

const injected = `
(function () {
  function getCookieMap() {
    var out = {};
    try {
      (document.cookie || "").split(";").forEach(function (p) {
        var kv = p.split("=");
        if (!kv[0]) return;
        var k = kv[0].trim();
        var v = (kv[1] || "").trim();
        if (k === "csrftoken" || k === "sessionid") out[k] = v;
      });
    } catch (e) {}
    return out;
  }
  var last = "";
  function tick() {
    try {
      var raw = document.cookie || "";
      if (raw !== last) {
        last = raw;
        var m = getCookieMap();
        if (m.csrftoken || m.sessionid) {
          window.ReactNativeWebView &&
            window.ReactNativeWebView.postMessage(
              JSON.stringify({ type: "cookies", cookies: m, href: location.href })
            );
        }
      }
    } catch (e) {}
    setTimeout(tick, 700);
  }
  tick();
})();
true;
`;

export type LoginModalProps = {
  visible: boolean;
  onRequestClose: () => void;
  colors: any;
  t: (k: string, p?: any) => string;

  canUseNativeJar: boolean;
  isExpoGo: boolean;
  wvBusy: boolean;
  setWvBusy: (b: boolean) => void;

  csrfInput: string;
  setCsrfInput: (s: string) => void;
  sessInput: string;
  setSessInput: (s: string) => void;

  applyManual: (csrf: string, sess: string) => Promise<void>;
  refreshTokensFromJar: (reason: string) => Promise<void>;
  fetchMeAndMaybeClose: (why: string) => Promise<void>;
  handleNavChange: any;
  onWvMessage: any;
};

export function LoginModal(props: LoginModalProps) {
  const {
    visible,
    onRequestClose,
    colors,
    t,
    canUseNativeJar,
    isExpoGo,
    wvBusy,
    setWvBusy,
    csrfInput,
    setCsrfInput,
    sessInput,
    setSessInput,
    applyManual,
    refreshTokensFromJar,
    fetchMeAndMaybeClose,
    handleNavChange,
    onWvMessage,
  } = props;

  const showManualInputs = !canUseNativeJar || isExpoGo;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onRequestClose}
    >
      <View style={{ flex: 1, backgroundColor: colors.page, paddingTop: 10 }}>
        <View
          style={{
            paddingHorizontal: 10,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text
            style={{ color: colors.title, fontWeight: "900", fontSize: 16 }}
          >
            {t("menu.login")}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {canUseNativeJar && (
              <IconBtn
                ripple={"#fff2"}
                overlayColor={"rgba(255,255,255,0.12)"}
                onPress={() => refreshTokensFromJar("manual")}
                size={36}
                accessibilityLabel={t("login.sync")}
              >
                <Feather name="download" size={18} color={colors.title} />
              </IconBtn>
            )}
            <IconBtn
              ripple={"#fff2"}
              overlayColor={"rgba(255,255,255,0.12)"}
              onPress={onRequestClose}
              size={36}
              accessibilityLabel={t("common.close")}
            >
              <Feather name="x" size={20} color={colors.title} />
            </IconBtn>
          </View>
        </View>

        <View style={{ height: 10 }} />

        <WebView
          originWhitelist={["*"]}
          source={{ uri: LOGIN_URL }}
          onLoadStart={() => setWvBusy(true)}
          onLoadEnd={async () => {
            setWvBusy(false);
            if (canUseNativeJar) await refreshTokensFromJar("loadEnd");
            await fetchMeAndMaybeClose("loadEnd");
          }}
          onLoadProgress={(e) => {
            if (canUseNativeJar && e?.nativeEvent?.progress >= 0.6) {
              refreshTokensFromJar("progress");
            }
          }}
          onNavigationStateChange={handleNavChange}
          onMessage={onWvMessage}
          injectedJavaScript={injected}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          startInLoadingState
          renderLoading={() => (
            <View style={{ padding: 8 }}>
              <ActivityIndicator />
            </View>
          )}
          allowsBackForwardNavigationGestures
          style={{ flex: 1 }}
        />

        <View style={{ padding: 8 }}>
          <Text
            style={{ color: colors.sub, fontSize: 12, textAlign: "center" }}
          >
            {wvBusy ? t("login.loading") : t("login.ready")}
          </Text>
        </View>
      </View>
    </Modal>
  );
}
