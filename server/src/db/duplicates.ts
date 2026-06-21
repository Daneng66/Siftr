import { getDb } from "./index";

export type DupKind = "exact" | "similar";
export type DupStatus = "kept" | "recommended" | "marked_for_deletion" | "ignored";

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
  path: string;
}

/** All duplicate groups with their member photo summaries, for the compare UI. */
export function listGroups(kind?: DupKind) {
  const db = getDb();
  // Single JOIN query instead of one query per group (N+1 → 1).
  const sql = `
    SELECT dg.id   AS group_id,
           dg.kind, dg.created_at,
           dm.photo_id, dm.status, dm.similarity,
           p.current_filename, p.file_size, p.width, p.height,
           p.path
      FROM duplicate_groups dg
      JOIN duplicate_group_members dm ON dm.group_id = dg.id
      JOIN photos p ON p.id = dm.photo_id
      ${kind ? "WHERE dg.kind = ?" : ""}
     ORDER BY dg.id DESC, p.file_size DESC`;

  const rows = (kind ? db.prepare(sql).all(kind) : db.prepare(sql).all()) as Array<
    { group_id: number; kind: DupKind; created_at: string } & DuplicateMemberView
  >;

  // Reassemble groups in JS — preserves ORDER BY dg.id DESC ordering.
  const groupMap = new Map<
    number,
    { id: number; kind: DupKind; created_at: string; members: DuplicateMemberView[] }
  >();
  for (const row of rows) {
    if (!groupMap.has(row.group_id)) {
      groupMap.set(row.group_id, {
        id: row.group_id,
        kind: row.kind,
        created_at: row.created_at,
        members: [],
      });
    }
    groupMap.get(row.group_id)!.members.push({
      group_id: row.group_id,
      photo_id: row.photo_id,
      status: row.status,
      similarity: row.similarity,
      current_filename: row.current_filename,
      file_size: row.file_size,
      width: row.width,
      height: row.height,
      path: row.path,
    });
  }
  return [...groupMap.values()];
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
