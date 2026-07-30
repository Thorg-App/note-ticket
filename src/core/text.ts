/**
 * The line terminator every ticket file and every line of output uses.
 *
 * WHY named and shared rather than a bare `"\n"` at each site: it appeared in six modules,
 * and "each output line ends with a newline" is the same single fact each time — bash's
 * `printf '%s\n'` / `echo`. WHY-NOT `os.EOL`: the on-disk format is LF on every platform,
 * and bash never emitted CRLF.
 */
export const LINE_SEPARATOR = "\n";
