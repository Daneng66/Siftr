import { getDb } from "./index";

export type DupKind = "exact" | "similar";
export type DupStatus = "kept" | "marked_for_deletion" | "ignored";

export interface GroupMemberInput {
  photoId: number;
  status: DupStatus;
  similarity?: string | null;
}

/** Replace all stored groups of a given kind with a freshly-scanned set. */
export function replaceGroups(
  kind: DupKind,
  groups: GroupMemberInput[][]
): number {
  const db = getDb();
  const tx = db.transaction(() => {
    // Remove existing groups of this kind (members cascade).
    const ids = db
      .prepare(`SELECT id FROM duplicate_groups WHERE kind = ?`)
      .all(kind) as Array<{ id: number }>;
    const del = db.prepare(`DELETE FROM duplicate_groups WHERE id = ?`);
    for (const { id } of ids) del.run(id);

    const insertGroup = db.prepare(
      `INSERT INTO duplicate_groups (kind) VALUES (?)`
    );
    const insertMember = db.prepare(
      `INSERT OR IGNORE INTO duplicate_group_members (group_id, photo_id, status, similarity)
       VALUES (?, ?, ?, ?)`
    );
    let count = 0;
    for (const members of groups) {
      if (members.length < 2) continue;
      const groupId = insertGroup.run(kind).lastInsertRowid as number;
      for (const m of members) {
        insertMember.run(groupId, m.photoId, m.status, m.similarity ?? null);
      }
      count++;
    }
    return count;
  });
  return tx();
}

export interface DuplicateMemberView {
  group_id: number;
  photo_id: number;
  status: DupStatus;
  similarity: string | null;
  current_filename: string;
  file_size: number;
  width: number | null;
  height: number | null;
  thumbnail_path: string | null;
  path: string;
}

/** All duplicate groups with their member photo summaries, for the compare UI. */
export function listGroups(kind?: DupKind) {
  const db = getDb();
  const groups = (
    kind
      ? db
          .prepare(
            `SELECT * FROM duplicate_groups WHERE kind = ? ORDER BY id DESC`
          )
          .all(kind)
      : db.prepare(`SELECT * FROM duplicate_groups ORDER BY id DESC`).all()
  ) as Array<{ id: number; kind: DupKind; created_at: string }>;

  const memberStmt = db.prepare(
    `SELECT dm.group_id, dm.photo_id, dm.status, dm.similarity,
            p.current_filename, p.file_size, p.width, p.height,
            p.thumbnail_path, p.path
       FROM duplicate_group_members dm
       JOIN photos p ON p.id = dm.photo_id
      WHERE dm.group_id = ?
      ORDER BY p.file_size DESC`
  );

  return groups.map((g) => ({
    ...g,
    members: memberStmt.all(g.id) as DuplicateMemberView[],
  }));
}

export function setMemberStatus(
  groupId: number,
  photoId: number,
  status: DupStatus
): void {
  getDb()
    .prepare(
      `UPDATE duplicate_group_members SET status = ?
        WHERE group_id = ? AND photo_id = ?`
    )
    .run(status, groupId, photoId);
}

export function getMembersMarkedForDeletion(groupId: number) {
  return getDb()
    .prepare(
      `SELECT photo_id FROM duplicate_group_members
        WHERE group_id = ? AND status = 'marked_for_deletion'`
    )
    .all(groupId) as Array<{ photo_id: number }>;
}
