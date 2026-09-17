import { APP, COLORS } from "@cutline/shared";
import { useState } from "react";
import { StatusBar, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { apiOrigin } from "./api";
import { AuthScreen } from "./auth-screen";
import { Workspace } from "./board-screen";
import { ClientContext, createClients, useClients } from "./clients";
import { Button, ErrorNotice, Loading, Screen, styles } from "./ui";

export default function App() {
  const [setup] = useState(() => {
    try {
      return {
        clients: createClients(apiOrigin(process.env.EXPO_PUBLIC_API_URL)),
        error: null,
      };
    } catch (error) {
      return { clients: null, error };
    }
  });
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.paper} />
      {setup.clients ? (
        <ClientContext.Provider value={setup.clients}>
          <SessionGate />
        </ClientContext.Provider>
      ) : (
        <Screen>
          <View style={styles.center}>
            <Text style={styles.heading}>{APP.name} setup</Text>
            <ErrorNotice error={setup.error} />
          </View>
        </Screen>
      )}
    </SafeAreaProvider>
  );
}

function SessionGate() {
  const { authClient } = useClients();
  const session = authClient.useSession();
  if (session.isPending)
    return (
      <Screen>
        <Loading label="Checking your session…" />
      </Screen>
    );
  if (session.error && !session.data)
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.heading}>Could not check your session</Text>
          <ErrorNotice
            error={session.error.message ?? "Check your connection."}
          />
          <Button
            title="Retry"
            onPress={() => {
              void session.refetch();
            }}
          />
        </View>
      </Screen>
    );
  if (!session.data)
    return (
      <AuthScreen
        onAuthenticated={() => {
          void session.refetch();
        }}
      />
    );
  return (
    <Workspace
      key={session.data.user.id}
      user={session.data.user}
      recheckSession={() => {
        void session.refetch();
      }}
    />
  );
}
