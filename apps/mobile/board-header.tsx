import type { SessionUser } from "@cutline/shared";
import { Text, View } from "react-native";
import { Button, confirmDiscard, styles, useAction } from "./ui";

export function BoardHeader({
  user,
  capture,
  pending,
  onSignOut,
}: {
  user: SessionUser;
  capture: string;
  pending: boolean;
  onSignOut: () => Promise<unknown>;
}) {
  const action = useAction();
  return (
    <View style={styles.header}>
      <View style={styles.flex}>
        <Text accessibilityRole="header" style={styles.heading}>
          Cutline
        </Text>
        <Text style={styles.muted}>{user.name}</Text>
      </View>
      <Button
        title="Sign out"
        disabled={action.pending || pending}
        onPress={() =>
          confirmDiscard(Boolean(capture), () => void action.run(onSignOut))
        }
      />
    </View>
  );
}
