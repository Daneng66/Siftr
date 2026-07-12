import fsp from "node:fs/promises";

/** Rename, falling back to copy + unlink when crossing devices (EXDEV). */
export async function moveFile(src: string, dest: string): Promise<void> {
  await fsp.rename(src, dest).catch(async (err) => {
    if ((err as NodeJS.ErrnoException).code === "EXDEV") {
      await fsp.copyFile(src, dest);
      await fsp.unlink(src);
    } else {
      throw err;
    }
  });
}
