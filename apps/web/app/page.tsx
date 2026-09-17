import { Workspace } from "../components/workspace";
import { DEFAULT_API_URL } from "../constants";

export const dynamic = "force-dynamic";

export default function Page() {
  const apiUrl =
    process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL;
  return <Workspace apiUrl={apiUrl} />;
}
