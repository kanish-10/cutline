import { APP, type Board, type SessionUser } from "@cutline/shared";
import { CREATOR_OPTIONS } from "../constants";
import { Brand, Icon } from "./brand";

export function WorkspaceNav({
  user,
  board,
  archive,
  onView,
  busy,
  signingOut,
  onSignOut,
}: {
  user: SessionUser;
  board: Board | null | undefined;
  archive: boolean;
  onView: (archive: boolean) => void;
  busy: boolean;
  signingOut: boolean;
  onSignOut: () => void;
}) {
  return (
    <aside className="workspace-nav">
      <Brand>{APP.name}</Brand>
      <div className="studio-label">
        <span className="studio-monogram" aria-hidden="true">
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <strong>My workspace</strong>
          <span>
            {board
              ? `${CREATOR_OPTIONS[board.creatorType].label} studio`
              : "Creator studio"}
          </span>
        </div>
      </div>
      <nav aria-label="Workspace">
        <p className="nav-label">Workspace</p>
        <button
          type="button"
          className="nav-item"
          aria-current={!archive ? "page" : undefined}
          disabled={!board}
          onClick={() => onView(false)}
        >
          <Icon name="board" />
          Production board
          <span className="count">
            {board?.cards.filter((card) => !card.archived).length ?? 0}
          </span>
        </button>
        <button
          type="button"
          className="nav-item"
          aria-current={archive ? "page" : undefined}
          disabled={!board}
          onClick={() => onView(true)}
        >
          <Icon name="archive" />
          Archive
          <span className="count">
            {board?.cards.filter((card) => card.archived).length ?? 0}
          </span>
        </button>
      </nav>
      <div className="nav-note">
        <span className="eyebrow">A little structure.</span>
        <p>More room to create.</p>
      </div>
      <div className="account">
        <span className="avatar" aria-hidden="true">
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="account-info">
          <strong>{user.name}</strong>
          <span title={user.email}>{user.email}</span>
        </div>
        <button
          type="button"
          className="icon-button"
          disabled={busy}
          aria-label={signingOut ? "Signing out…" : "Sign out"}
          title="Sign out"
          onClick={onSignOut}
        >
          <Icon name="logout" />
        </button>
      </div>
    </aside>
  );
}
