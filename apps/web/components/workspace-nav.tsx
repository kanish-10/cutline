import {
  APP,
  type Board,
  type BoardSummary,
  type SessionUser,
} from "@cutline/shared";
import { useTheme } from "@/hooks/useTheme";
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
  boards,
  boardId,
  switchingBlocked,
  onSelectBoard,
  onCreateBoard,
}: {
  user: SessionUser;
  board: Board | null | undefined;
  archive: boolean;
  onView: (archive: boolean) => void;
  busy: boolean;
  signingOut: boolean;
  onSignOut: () => void;
  boards: BoardSummary[];
  boardId: string | null;
  switchingBlocked: boolean;
  onSelectBoard: (id: string) => void;
  onCreateBoard: () => void;
}) {
  const { resolvedTheme, toggleTheme } = useTheme();

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
      <div className="board-picker">
        <label>
          Your boards
          <select
            value={boardId ?? ""}
            disabled={switchingBlocked || !boards.length}
            onChange={(event) => onSelectBoard(event.target.value)}
          >
            {!boards.length && <option value="">Your first board</option>}
            {boards.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        {boards.length > 0 && (
          <button
            type="button"
            disabled={switchingBlocked}
            onClick={onCreateBoard}
          >
            <Icon name="plus" /> New board
          </button>
        )}
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
          onClick={toggleTheme}
          aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
          title={`Theme: ${resolvedTheme.charAt(0).toUpperCase() + resolvedTheme.slice(1)} (⌘⇧D to toggle)`}
        >
          <Icon name={resolvedTheme === "dark" ? "sun" : "moon"} />
        </button>
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
