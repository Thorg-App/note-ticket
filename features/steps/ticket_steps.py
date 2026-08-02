"""Step definitions for ticket CLI BDD tests."""

import json
import os
import re
import shutil
import signal
import subprocess
import tempfile
import time
from pathlib import Path

from behave import given, when, then, register_type, use_step_matcher
import parse


# Use regex matcher for more flexible step definitions
use_step_matcher("re")


# features/steps/ticket_steps.py -> features/steps -> features -> repo root
REPO = Path(__file__).resolve().parent.parent.parent


# ============================================================================
# Helper Functions
# ============================================================================

def get_ticket_script(context):
    """Get the ticket script path, defaulting to ./ticket or using TICKET_SCRIPT env var."""
    # A scenario that materialized an isolated copy of the tool must drive THAT copy, not
    # the developer's checkout, whichever way the checkout is normally located.
    isolated = getattr(context, 'ticket_script_override', None)
    if isolated:
        return isolated
    ticket_script = os.environ.get('TICKET_SCRIPT')
    if ticket_script:
        return ticket_script
    return str(Path(context.project_dir) / 'ticket')


def title_to_slug(title):
    """Convert a title to a filename-safe slug (mirrors bash title_to_filename)."""
    slug = title.lower().replace(' ', '-')
    slug = re.sub(r'[^a-z0-9-]', '', slug)
    slug = re.sub(r'-{2,}', '-', slug)
    slug = slug.strip('-')
    if not slug:
        slug = 'untitled'
    return slug


def create_ticket(context, ticket_id, title, priority=2, parent=None):
    """Helper to create a ticket file with title-based filename and frontmatter title."""
    tickets_dir = Path(context.test_dir) / '_tickets'
    tickets_dir.mkdir(parents=True, exist_ok=True)

    slug = title_to_slug(title)
    ticket_path = tickets_dir / f'{slug}.md'

    # Handle filename collisions
    if ticket_path.exists():
        counter = 1
        while (tickets_dir / f'{slug}-{counter}.md').exists():
            counter += 1
        ticket_path = tickets_dir / f'{slug}-{counter}.md'

    escaped_title = title.replace('"', '\\"')
    content = f'''---
id: {ticket_id}
title: "{escaped_title}"
status: open
deps: []
links: []
created_iso: 2024-01-01T00:00:00Z
status_updated_iso: 2024-01-01T00:00:00Z
type: task
priority: {priority}
'''
    if parent:
        content += f'parent: {parent}\n'
    content += '''---

Description
'''
    ticket_path.write_text(content)

    if not hasattr(context, 'tickets'):
        context.tickets = {}
    context.tickets[ticket_id] = ticket_path
    return ticket_path


def find_ticket_file(context, ticket_id):
    """Find a ticket file by searching frontmatter id: field.
    First checks context.tickets dict, then falls back to scanning files."""
    if hasattr(context, 'tickets') and ticket_id in context.tickets:
        path = context.tickets[ticket_id]
        if path.exists():
            return path

    # Fallback: scan _tickets/ directory
    tickets_dir = Path(context.test_dir) / '_tickets'
    if not tickets_dir.exists():
        raise FileNotFoundError(f"Tickets directory not found at {tickets_dir}")

    # rglob: ticket files may live in nested subfolders under _tickets/
    for md_file in tickets_dir.rglob('*.md'):
        content = md_file.read_text()
        if re.search(rf'^id:\s*{re.escape(ticket_id)}\s*$', content, re.MULTILINE):
            return md_file

    raise FileNotFoundError(f"No ticket file found with id: {ticket_id}")


def extract_created_id(stdout):
    """Extract ticket ID from create command output (JSON format)."""
    output = stdout.strip()
    if not output:
        return None
    try:
        data = json.loads(output)
        return data.get('id')
    except json.JSONDecodeError:
        # Fallback: return raw output (for non-JSON commands)
        return output


class ReportedCycle:
    """One `Cycle N:` block of `dep cycle` output: its number and its member ids."""

    def __init__(self, number):
        self.number = number
        self.members = set()


def parse_reported_cycles(stdout):
    """Parse `dep cycle` output into a list of `ReportedCycle`s (number + member ids).

    Output shape: `Cycle N: a -> b -> a` followed by one indented row per member
    (`  <id> [<status>] <title>`), with a blank line between cycles. Comparing member
    SETS keeps assertions independent of which member a walk happens to start at.
    """
    cycles = []
    for line in stdout.split('\n'):
        header = re.match(r'^Cycle (\d+): ', line)
        if header:
            cycles.append(ReportedCycle(int(header.group(1))))
        elif line.startswith('  ') and cycles:
            cycles[-1].members.add(line.split()[0])
    return cycles


def _track_created_ticket(context, command, result):
    """Track ticket ID and path from create command JSON output."""
    if 'ticket create' not in command or result.returncode != 0:
        return
    created_id = extract_created_id(result.stdout)
    if not created_id:
        return
    context.last_created_id = created_id
    try:
        data = json.loads(result.stdout.strip())
        if 'full_path' in data:
            if not hasattr(context, 'tickets'):
                context.tickets = {}
            context.tickets[created_id] = Path(data['full_path'])
    except (json.JSONDecodeError, KeyError):
        pass


# ============================================================================
# Given Steps
# ============================================================================

@given(r'a clean tickets directory')
def step_clean_tickets_directory(context):
    """Ensure we start with a clean _tickets directory."""
    tickets_dir = Path(context.test_dir) / '_tickets'
    if tickets_dir.exists():
        import shutil
        shutil.rmtree(tickets_dir)
    tickets_dir.mkdir(parents=True, exist_ok=True)


@given(r'the git user\.name is "(?P<name>[^"]+)"')
def step_git_user_name_is(context, name):
    """Set `user.name` in the scenario's own repository.

    Repository-local config beats the developer's/CI's global config, so the value the
    command reads is fully determined by this step -- which is what makes asserting
    `create`'s default assignee non-flaky.
    """
    subprocess.run(
        ['git', 'config', 'user.name', name],
        cwd=context.test_dir,
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


@given(r'the tickets directory does not exist')
def step_tickets_dir_not_exist(context):
    """Ensure _tickets directory does not exist."""
    tickets_dir = Path(context.test_dir) / '_tickets'
    if tickets_dir.exists():
        import shutil
        shutil.rmtree(tickets_dir)


@given(r'a ticket exists with ID "(?P<ticket_id>[^"]+)" and title "(?P<title>[^"]+)" with priority (?P<priority>\d+)')
def step_ticket_exists_with_priority(context, ticket_id, title, priority):
    """Create a ticket with given ID, title, and priority."""
    create_ticket(context, ticket_id, title, priority=int(priority))


@given(r'a ticket exists with ID "(?P<ticket_id>[^"]+)" and title "(?P<title>[^"]+)" with parent "(?P<parent_id>[^"]+)"')
def step_ticket_exists_with_parent(context, ticket_id, title, parent_id):
    """Create a ticket with given ID, title, and parent."""
    create_ticket(context, ticket_id, title, parent=parent_id)


@given(r'a ticket exists with ID "(?P<ticket_id>[^"]+)" and title "(?P<title>[^"]+)"')
def step_ticket_exists(context, ticket_id, title):
    """Create a ticket with given ID and title (basic, no extra params)."""
    # This is the most generic form - the more specific ones should be defined first
    create_ticket(context, ticket_id, title)


@given(r'I move ticket "(?P<ticket_id>[^"]+)" to subfolder "(?P<subfolder>[^"]+)"')
def step_move_ticket_to_subfolder(context, ticket_id, subfolder):
    """Move a ticket file into a (possibly deep) subfolder under _tickets/."""
    ticket_path = find_ticket_file(context, ticket_id)
    target_dir = Path(context.test_dir) / '_tickets' / subfolder
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / ticket_path.name
    ticket_path.rename(target_path)
    context.tickets[ticket_id] = target_path


@given(r'I rename the file of ticket "(?P<ticket_id>[^"]+)" to "(?P<filename>[^"]+)"')
def step_rename_ticket_file(context, ticket_id, filename):
    """Rename a ticket file in place, keeping it in the same directory."""
    ticket_path = find_ticket_file(context, ticket_id)
    target_path = ticket_path.parent / filename
    ticket_path.rename(target_path)
    context.tickets[ticket_id] = target_path


@given(r'an empty subfolder "(?P<subfolder>[^"]+)" exists under the tickets directory')
def step_empty_subfolder_exists(context, subfolder):
    """Create an empty (ticket-free) subfolder under _tickets/."""
    (Path(context.test_dir) / '_tickets' / subfolder).mkdir(parents=True, exist_ok=True)


@given(r'the tickets directory is replaced by a symlink to "(?P<real_dir>[^"]+)"')
def step_tickets_dir_is_symlink(context, real_dir):
    """Move _tickets/ aside and put a symlink in its place, as a notes-vault setup would."""
    tickets_dir = Path(context.test_dir) / '_tickets'
    target_dir = Path(context.test_dir) / real_dir
    tickets_dir.rename(target_dir)
    tickets_dir.symlink_to(target_dir)
    # Re-point tracked paths at the moved files so later assertions still resolve.
    for ticket_id, path in getattr(context, 'tickets', {}).items():
        context.tickets[ticket_id] = target_dir / path.relative_to(target_dir.parent / '_tickets')


@given(r'ticket "(?P<ticket_id>[^"]+)" is moved out of the tickets directory and symlinked back')
def step_ticket_file_is_symlink(context, ticket_id):
    """Replace a ticket file with a symlink pointing outside _tickets/."""
    ticket_path = find_ticket_file(context, ticket_id)
    external_dir = Path(context.test_dir) / 'external'
    external_dir.mkdir(parents=True, exist_ok=True)
    external_path = external_dir / ticket_path.name
    ticket_path.rename(external_path)
    ticket_path.symlink_to(external_path)
    context.tickets[ticket_id] = ticket_path


@given(r'ticket "(?P<ticket_id>[^"]+)" has status "(?P<status>[^"]+)"')
def step_ticket_has_status(context, ticket_id, status):
    """Set ticket status."""
    ticket_path = find_ticket_file(context, ticket_id)
    content = ticket_path.read_text()
    content = re.sub(r'^status: \w+', f'status: {status}', content, flags=re.MULTILINE)
    ticket_path.write_text(content)


@given(r'ticket "(?P<ticket_id>[^"]+)" depends on "(?P<dep_id>[^"]+)"')
def step_ticket_depends_on(context, ticket_id, dep_id):
    """Add dependency to ticket."""
    ticket_path = find_ticket_file(context, ticket_id)
    content = ticket_path.read_text()

    # Parse current deps
    deps_match = re.search(r'^deps: \[(.*?)\]', content, re.MULTILINE)
    if deps_match:
        current_deps = deps_match.group(1)
        if current_deps:
            deps_list = [d.strip() for d in current_deps.split(',')]
            if dep_id not in deps_list:
                deps_list.append(dep_id)
        else:
            deps_list = [dep_id]
        new_deps = ', '.join(deps_list)
        content = re.sub(r'^deps: \[.*?\]', f'deps: [{new_deps}]', content, flags=re.MULTILINE)

    ticket_path.write_text(content)


@given(r'ticket "(?P<ticket_id>[^"]+)" is linked to "(?P<link_id>[^"]+)"')
def step_ticket_linked_to(context, ticket_id, link_id):
    """Create bidirectional link between tickets."""
    # Update first ticket
    ticket_path = find_ticket_file(context, ticket_id)
    content = ticket_path.read_text()
    links_match = re.search(r'^links: \[(.*?)\]', content, re.MULTILINE)
    if links_match:
        current_links = links_match.group(1)
        if current_links:
            links_list = [l.strip() for l in current_links.split(',')]
            if link_id not in links_list:
                links_list.append(link_id)
        else:
            links_list = [link_id]
        new_links = ', '.join(links_list)
        content = re.sub(r'^links: \[.*?\]', f'links: [{new_links}]', content, flags=re.MULTILINE)
    ticket_path.write_text(content)

    # Update second ticket
    link_path = find_ticket_file(context, link_id)
    content = link_path.read_text()
    links_match = re.search(r'^links: \[(.*?)\]', content, re.MULTILINE)
    if links_match:
        current_links = links_match.group(1)
        if current_links:
            links_list = [l.strip() for l in current_links.split(',')]
            if ticket_id not in links_list:
                links_list.append(ticket_id)
        else:
            links_list = [ticket_id]
        new_links = ', '.join(links_list)
        content = re.sub(r'^links: \[.*?\]', f'links: [{new_links}]', content, flags=re.MULTILINE)
    link_path.write_text(content)


@given(r'ticket "(?P<ticket_id>[^"]+)" has a notes section')
def step_ticket_has_notes(context, ticket_id):
    """Ensure ticket has a notes section."""
    ticket_path = find_ticket_file(context, ticket_id)
    content = ticket_path.read_text()
    if '## Notes' not in content:
        content += '\n## Notes\n'
        ticket_path.write_text(content)


@given(r'ticket "(?P<ticket_id>[^"]+)" has body content with a horizontal rule and fake frontmatter')
def step_ticket_has_hr_and_fake_frontmatter(context, ticket_id):
    """Append body content containing a --- horizontal rule and fake key: value lines."""
    ticket_path = find_ticket_file(context, ticket_id)
    content = ticket_path.read_text()
    content += '\nSome notes above the rule.\n\n---\n\nfake_field: leaked_value\n'
    ticket_path.write_text(content)


@given(r'a raw ticket file "(?P<filename>[^"]+)" exists with content')
def step_raw_ticket_file(context, filename):
    """Write a file under _tickets/ verbatim from the scenario's docstring.

    For shapes `create` can never produce -- notably a ticket with no usable 'id',
    which every enumerating command must reject by name.
    """
    path = Path(context.test_dir) / '_tickets' / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(context.text + '\n')


@given(r'a raw ticket file "(?P<filename>[^"]+)" exists with CRLF line endings and content')
def step_raw_crlf_ticket_file(context, filename):
    """Same, but every line ends CRLF -- a Windows editor or `core.autocrlf=true` checkout.

    CRLF ticket files are unsupported: `---\\r` is not the frontmatter fence, so the file
    must be rejected for its LINE ENDINGS, never for the 'id' it visibly contains.
    """
    path = Path(context.test_dir) / '_tickets' / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    # newline='' keeps python from re-translating the \r\n we write.
    with open(path, 'w', newline='') as f:
        f.write((context.text + '\n').replace('\n', '\r\n'))


@given(r'ticket "(?P<ticket_id>[^"]+)" was modified (?P<seconds>\d+) seconds ago')
def step_ticket_modified_seconds_ago(context, ticket_id, seconds):
    """Pin a ticket file's mtime. `closed` orders by it, and files created microseconds
    apart in a test would otherwise make the expected order a coin flip."""
    path = find_ticket_file(context, ticket_id)
    when = time.time() - int(seconds)
    os.utime(path, (when, when))


@given(r'ticket "(?P<ticket_id>[^"]+)" has a tab character in its title')
def step_ticket_title_has_tab(context, ticket_id):
    """Put a raw TAB inside the quoted title, which `create` happily writes.

    A control character inside a JSON string must be escaped; bash's `query` emitted it raw
    and produced JSONL that jq itself refuses to parse.
    """
    path = find_ticket_file(context, ticket_id)
    lines = path.read_text().split('\n')
    for index, line in enumerate(lines):
        if line.startswith('title:'):
            lines[index] = 'title: "tab\there"'
            break
    else:
        raise AssertionError(f"no title line in {path}")
    path.write_text('\n'.join(lines))


@given(r'the tickets directory is not writable')
def step_tickets_dir_not_writable(context):
    """Drop write permission on _tickets, so rewriting a ticket fails with EACCES.

    Root ignores the permission bits entirely, which would make the scenario pass for
    the wrong reason — skip loudly instead of asserting nothing. after_scenario restores
    the permissions so the temp tree can be removed.
    """
    if os.geteuid() == 0:
        context.scenario.skip('running as root: permission bits are not enforced')
        return
    (Path(context.test_dir) / '_tickets').chmod(0o555)


@given(r'the test root is not a git repository')
def step_test_root_not_git(context):
    """Remove the git repository from the test root."""
    git_dir = Path(context.test_dir) / '.git'
    if git_dir.exists():
        import shutil
        shutil.rmtree(git_dir)


@given(r'a nested git repository exists in subdirectory "(?P<subdir>[^"]+)"')
def step_nested_git_repo_in_subdir(context, subdir):
    """Initialize a nested git repository in the specified subdirectory.
    A nested repo is its own tickets root (mirrors a git submodule)."""
    subdir_path = Path(context.test_dir) / subdir
    subdir_path.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ['git', 'init', '-q'],
        cwd=str(subdir_path),
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


@given(r'I am in subdirectory "(?P<subdir>[^"]+)"')
def step_in_subdirectory(context, subdir):
    """Change to a subdirectory (creating it if needed)."""
    subdir_path = Path(context.test_dir) / subdir
    subdir_path.mkdir(parents=True, exist_ok=True)
    context.working_dir = str(subdir_path)


@given(r'a separate tickets directory exists at "(?P<dir_path>[^"]+)" with ticket "(?P<ticket_id>[^"]+)" titled "(?P<title>[^"]+)"')
def step_separate_tickets_dir(context, dir_path, ticket_id, title):
    """Create a separate tickets directory with a ticket."""
    tickets_dir = Path(context.test_dir) / dir_path
    tickets_dir.mkdir(parents=True, exist_ok=True)

    slug = title_to_slug(title)
    ticket_path = tickets_dir / f'{slug}.md'

    escaped_title = title.replace('"', '\\"')
    content = f'''---
id: {ticket_id}
title: "{escaped_title}"
status: open
deps: []
links: []
created_iso: 2024-01-01T00:00:00Z
status_updated_iso: 2024-01-01T00:00:00Z
type: task
priority: 2
---

Description
'''
    ticket_path.write_text(content)


# ============================================================================
# When Steps
# ============================================================================

@when(r'I run "(?P<command>(?:[^"\\]|\\.)+)" in non-TTY mode')
def step_run_command_non_tty(context, command):
    """Run a command simulating non-TTY mode."""
    # Unescape \" to " in the command string
    command = command.replace('\\"', '"')

    ticket_script = get_ticket_script(context)
    cmd = command.replace('ticket ', f'{ticket_script} ', 1)

    result = subprocess.run(
        cmd,
        shell=True,
        cwd=context.test_dir,
        capture_output=True,
        text=True,
        stdin=subprocess.DEVNULL  # Simulate non-TTY
    )

    context.result = result
    context.stdout = result.stdout.strip()
    context.stderr = result.stderr.strip()
    context.returncode = result.returncode


@when(r'I run "(?P<command>(?:[^"\\]|\\.)+)" with no stdin')
def step_run_command_no_stdin(context, command):
    """Run a command with stdin closed."""
    ticket_script = get_ticket_script(context)
    cmd = command.replace('ticket ', f'{ticket_script} ', 1)

    result = subprocess.run(
        cmd,
        shell=True,
        cwd=context.test_dir,
        capture_output=True,
        text=True,
        stdin=subprocess.DEVNULL
    )

    context.result = result
    context.stdout = result.stdout.strip()
    context.stderr = result.stderr.strip()
    context.returncode = result.returncode


@when(r'I run "(?P<command>(?:[^"\\]|\\.)+)" with TICKETS_DIR set to "(?P<tickets_dir>[^"]+)"')
def step_run_command_with_env(context, command, tickets_dir):
    """Run a ticket CLI command with custom TICKETS_DIR."""
    command = command.replace('\\"', '"')
    ticket_script = get_ticket_script(context)
    cmd = command.replace('ticket ', f'{ticket_script} ', 1)

    # Use working_dir if set (from subdirectory step), otherwise test_dir
    cwd = getattr(context, 'working_dir', context.test_dir)

    # Resolve tickets_dir relative to test_dir
    env = os.environ.copy()
    env['TICKETS_DIR'] = str(Path(context.test_dir) / tickets_dir)

    result = subprocess.run(
        cmd,
        shell=True,
        cwd=cwd,
        capture_output=True,
        text=True,
        stdin=subprocess.DEVNULL,
        env=env
    )

    context.result = result
    context.stdout = result.stdout.strip()
    context.stderr = result.stderr.strip()
    context.returncode = result.returncode
    context.last_command = command


STDIN_OPEN_TIMEOUT_SECONDS = 20


@when(r'I run "(?P<command>(?:[^"\\]|\\.)+)" with stdin left open')
def step_run_command_stdin_left_open(context, command):
    """Run a command with an open, never-written stdin pipe.

    WHY: `awk 'prog'` with no file operands reads stdin. If a command ever passes an
    empty file list to awk it would block forever on a terminal; a live pipe reproduces
    that, and the timeout turns the hang into a test failure instead of a stuck CI job.

    WHY-NOT `stdin=subprocess.PIPE`: `communicate()` closes a PIPE stdin immediately when
    given no input, so awk sees EOF at once and a hanging script would still pass. We hand
    the child a raw pipe read end and keep the write end open in this process, so its stdin
    never reaches EOF.

    WHY `start_new_session` + `killpg`: on timeout the child is a bash wrapper whose awk
    grandchild holds the stdout pipe. Killing only the wrapper leaves awk alive and the
    follow-up `communicate()` never returns, hanging the suite instead of failing it.
    """
    command = command.replace('\\"', '"')
    ticket_script = get_ticket_script(context)
    cmd = command.replace('ticket ', f'{ticket_script} ', 1)
    cwd = getattr(context, 'working_dir', context.test_dir)

    read_fd, write_fd = os.pipe()
    try:
        process = subprocess.Popen(
            cmd,
            shell=True,
            cwd=cwd,
            stdin=read_fd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=os.environ.copy(),
            start_new_session=True
        )
        os.close(read_fd)
        read_fd = -1  # Popen duplicated it; only the child holds the read end now.
        try:
            stdout, stderr = process.communicate(timeout=STDIN_OPEN_TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired:
            os.killpg(os.getpgid(process.pid), signal.SIGKILL)
            process.communicate()
            raise AssertionError(
                f"Command blocked on stdin for more than {STDIN_OPEN_TIMEOUT_SECONDS}s: [{cmd}]"
            )
    finally:
        if read_fd != -1:
            os.close(read_fd)
        os.close(write_fd)

    context.result = process
    context.stdout = stdout.strip()
    context.stderr = stderr.strip()
    context.returncode = process.returncode
    context.last_command = command


def _path_without(binary_name):
    """A PATH identical to the current one except that `binary_name` is not on it.

    WHY the symlink farm: `query <filter>` must be exercised with jq genuinely absent, and
    jq lives in the same directory as most of the tools the bash script needs (awk, sed,
    find, git, node), so dropping directories from PATH is not an option. Every executable
    on the real PATH is linked into one scratch dir, minus the one being hidden.

    WHY-NOT an env var naming the binary: that is a test-only knob in shipped code.

    WHY $REPO/.tmp and not the system temp dir: the links in the farm have to be
    EXECUTED, and TMPDIR can be a noexec mount (/dev/shm on this machine).
    """
    scratch = REPO / '.tmp'
    scratch.mkdir(parents=True, exist_ok=True)
    farm = Path(tempfile.mkdtemp(prefix='path-without-%s-' % binary_name, dir=str(scratch)))
    for directory in os.environ.get('PATH', '').split(os.pathsep):
        if not directory or not os.path.isdir(directory):
            continue
        for name in os.listdir(directory):
            if name == binary_name or (farm / name).exists():
                continue
            try:
                (farm / name).symlink_to(Path(directory) / name)
            except OSError:
                pass
    assert shutil.which(binary_name, path=str(farm)) is None, \
        f"[{binary_name}] is still reachable on the stripped PATH"
    return farm


@when(r'I run "(?P<command>(?:[^"\\]|\\.)+)" with (?P<binary>[a-z]+) missing from PATH')
def step_run_command_without_binary(context, command, binary):
    """Run a command with one external binary made unreachable."""
    command = command.replace('\\"', '"')
    ticket_script = get_ticket_script(context)
    cmd = command.replace('ticket ', f'{ticket_script} ', 1)
    farm = _path_without(binary)
    try:
        env = os.environ.copy()
        env['PATH'] = str(farm)
        result = subprocess.run(
            cmd,
            shell=True,
            cwd=getattr(context, 'working_dir', context.test_dir),
            capture_output=True,
            text=True,
            stdin=subprocess.DEVNULL,
            env=env
        )
    finally:
        shutil.rmtree(farm, ignore_errors=True)

    context.result = result
    context.stdout = result.stdout.strip()
    context.stderr = result.stderr.strip()
    context.returncode = result.returncode
    context.last_command = command


@when(r'I run "(?P<command>(?:[^"\\]|\\.)+)" with "(?P<piped>(?:[^"\\]|\\.)*)" on stdin')
def step_run_command_with_stdin(context, command, piped):
    """Run a command with text piped into its stdin.

    WHY a dedicated runner: every other runner passes `stdin=DEVNULL`, which is readable and
    at EOF, so `add-note`'s "read the note from stdin" arm is exercised but always with an
    EMPTY note. `\\n` in the step text is a real newline, so trailing-newline handling can be
    asserted.
    """
    command = command.replace('\\"', '"')
    piped = piped.replace('\\n', '\n').replace('\\"', '"')

    ticket_script = get_ticket_script(context)
    cmd = command.replace('ticket ', f'{ticket_script} ', 1)
    cwd = getattr(context, 'working_dir', context.test_dir)

    result = subprocess.run(
        cmd,
        shell=True,
        cwd=cwd,
        capture_output=True,
        text=True,
        input=piped,
        env=os.environ.copy(),
    )

    context.result = result
    context.stdout = result.stdout.strip()
    context.stderr = result.stderr.strip()
    context.returncode = result.returncode
    context.last_command = command


@when(r'I run "(?P<command>(?:[^"\\]|\\.)+)"')
def step_run_command(context, command):
    """Run a ticket CLI command."""
    # Unescape \" to " in the command string
    command = command.replace('\\"', '"')

    ticket_script = get_ticket_script(context)
    cmd = command.replace('ticket ', f'{ticket_script} ', 1)

    # Use working_dir if set (from subdirectory step), otherwise test_dir
    cwd = getattr(context, 'working_dir', context.test_dir)

    env = os.environ.copy()

    result = subprocess.run(
        cmd,
        shell=True,
        cwd=cwd,
        capture_output=True,
        text=True,
        stdin=subprocess.DEVNULL,  # Non-interactive tests
        env=env
    )

    context.result = result
    context.stdout = result.stdout.strip()
    context.stderr = result.stderr.strip()
    context.returncode = result.returncode
    context.last_command = command

    _track_created_ticket(context, command, result)


# ============================================================================
# Then Steps
# ============================================================================

@then(r'the command should succeed')
def step_command_succeed(context):
    """Assert command returned exit code 0."""
    assert context.returncode == 0, \
        f"Command failed with exit code {context.returncode}\nstdout: {context.stdout}\nstderr: {context.stderr}"


@then(r'the command should fail')
def step_command_fail(context):
    """Assert command returned non-zero exit code."""
    assert context.returncode != 0, \
        f"Command succeeded but was expected to fail\nstdout: {context.stdout}"


@then(r'the exit code should be (?P<code>\d+)')
def step_exit_code_is(context, code):
    """Assert an EXACT exit code, for the codes that are themselves the contract."""
    assert context.returncode == int(code), \
        f"Expected exit code {code} but got {context.returncode}\nstderr: {context.stderr}"


@then(r'the output should be "(?P<expected>[^"]*)"')
def step_output_equals(context, expected):
    """Assert output exactly matches expected string."""
    actual = context.stdout
    assert actual == expected, f"Expected '{expected}' but got '{actual}'"


@then(r'the output should be empty')
def step_output_empty(context):
    """Assert output is empty."""
    assert context.stdout == '', f"Expected empty output but got: {context.stdout}"


@then(r'the output should contain "(?P<text>[^"]+)"')
def step_output_contains(context, text):
    """Assert output contains text."""
    output = context.stdout + context.stderr
    assert text in output, f"Expected output to contain '{text}'\nActual output: {output}"


@then(r'stderr should contain "(?P<text>[^"]+)"')
def step_stderr_contains(context, text):
    """Assert the text went to STDERR specifically, not merely to one of the streams."""
    assert text in context.stderr, \
        f"Expected stderr to contain '{text}'\nActual stderr: {context.stderr}"


@then(r'the output should not contain "(?P<text>[^"]+)"')
def step_output_not_contains(context, text):
    """Assert output does not contain text."""
    output = context.stdout + context.stderr
    assert text not in output, f"Expected output to NOT contain '{text}'\nActual output: {output}"


@then(r'the output should be valid JSON with an id field')
def step_output_valid_json_with_id(context):
    """Assert output is valid JSON containing an id field."""
    try:
        data = json.loads(context.stdout)
    except json.JSONDecodeError as e:
        raise AssertionError(f"Output is not valid JSON: {context.stdout}\nError: {e}")
    assert 'id' in data, f"JSON output missing 'id' field\nData: {data}"


@then(r'the output should match a ticket ID pattern')
def step_output_matches_id_pattern(context):
    """Assert output is valid JSON from create command with ID matching nid_<25chars>_e format."""
    try:
        data = json.loads(context.stdout)
    except json.JSONDecodeError as e:
        raise AssertionError(f"Output is not valid JSON: {context.stdout}\nError: {e}")
    assert 'id' in data, f"JSON output missing 'id' field\nData: {data}"
    ticket_id = data['id']
    id_pattern = re.compile(r'^nid_[a-z0-9]{25}_e$')
    assert id_pattern.match(ticket_id), \
        f"Ticket ID '{ticket_id}' does not match expected pattern 'nid_<25chars>_e'"


@then(r'the output should match pattern "(?P<pattern>[^"]+)"')
def step_output_matches_pattern(context, pattern):
    """Assert output matches regex pattern."""
    assert re.search(pattern, context.stdout), \
        f"Output does not match pattern '{pattern}'\nActual output: {context.stdout}"


@then(r'the output should match box-drawing tree format')
def step_output_matches_tree_format(context):
    """Assert output contains box-drawing characters for tree."""
    output = context.stdout
    has_tree_chars = any(c in output for c in ['├', '└', '│', '─'])
    assert has_tree_chars, f"Output does not contain box-drawing characters:\n{output}"


@then(r'a ticket file should exist with title "(?P<title>[^"]+)"')
def step_ticket_file_exists_with_title(context, title):
    """Assert a ticket file exists with given title in frontmatter."""
    ticket_id = context.last_created_id
    ticket_path = find_ticket_file(context, ticket_id)

    assert ticket_path.exists(), f"Ticket file {ticket_path} does not exist"
    content = ticket_path.read_text()
    # Title is now in frontmatter, not body
    assert re.search(rf'^title:\s*"?{re.escape(title)}"?\s*$', content, re.MULTILINE), \
        f"Ticket does not have title '{title}' in frontmatter\nContent: {content}"


@then(r'no ticket file should exist with title "(?P<title>[^"]+)"')
def step_no_ticket_file_with_title(context, title):
    """Assert NOTHING under _tickets/ carries that title -- i.e. the write never happened."""
    tickets_dir = Path(context.test_dir) / '_tickets'
    pattern = rf'^title:\s*"?{re.escape(title)}"?\s*$'
    matches = [
        str(path) for path in tickets_dir.rglob('*.md')
        if re.search(pattern, path.read_text(), re.MULTILINE)
    ]
    assert not matches, f"Expected no ticket titled '{title}', found: {matches}"


@then(r'the tickets directory should exist')
def step_tickets_dir_exists(context):
    """Assert _tickets directory exists."""
    tickets_dir = Path(context.test_dir) / '_tickets'
    assert tickets_dir.exists(), f"_tickets directory does not exist"


@then(r'tickets directory should exist in current subdirectory')
def step_tickets_dir_exists_in_subdir(context):
    """Assert _tickets directory exists in the current working subdirectory."""
    cwd = getattr(context, 'working_dir', context.test_dir)
    tickets_dir = Path(cwd) / '_tickets'
    assert tickets_dir.exists(), f"_tickets directory does not exist in {cwd}"


@then(r'tickets directory should exist in test root')
def step_tickets_dir_exists_in_test_root(context):
    """Assert _tickets directory exists in the test root directory."""
    tickets_dir = Path(context.test_dir) / '_tickets'
    assert tickets_dir.exists(), f"_tickets directory does not exist in test root {context.test_dir}"


@then(r'tickets directory should exist in subdirectory "(?P<subdir>[^"]+)"')
def step_tickets_dir_exists_in_named_subdir(context, subdir):
    """Assert _tickets directory exists in the specified subdirectory."""
    subdir_path = Path(context.test_dir) / subdir
    tickets_dir = subdir_path / '_tickets'
    assert tickets_dir.exists(), f"_tickets directory does not exist in {subdir_path}"


@then(r'the created ticket should contain "(?P<text>[^"]+)"')
def step_created_ticket_contains(context, text):
    """Assert the most recently created ticket contains text."""
    ticket_id = context.last_created_id
    ticket_path = find_ticket_file(context, ticket_id)
    content = ticket_path.read_text()
    assert text in content, f"Ticket does not contain '{text}'\nContent: {content}"


@then(r'the created ticket should have field "(?P<field>[^"]+)" with value "(?P<value>[^"]+)"')
def step_created_ticket_has_field(context, field, value):
    """Assert the most recently created ticket has a field with value."""
    ticket_id = context.last_created_id
    ticket_path = find_ticket_file(context, ticket_id)
    content = ticket_path.read_text()

    pattern = rf'^{re.escape(field)}:\s*(.+)$'
    match = re.search(pattern, content, re.MULTILINE)
    assert match, f"Field '{field}' not found in ticket\nContent: {content}"
    actual = match.group(1).strip()
    # Strip surrounding quotes for comparison (title is stored as "value")
    actual_unquoted = actual.strip('"')
    assert actual == value or actual_unquoted == value, \
        f"Field '{field}' has value '{actual}', expected '{value}'"


@then(r'the created ticket should have a valid created timestamp')
def step_created_ticket_has_timestamp(context):
    """Assert the created ticket has a valid timestamp."""
    ticket_id = context.last_created_id
    ticket_path = find_ticket_file(context, ticket_id)
    content = ticket_path.read_text()

    pattern = r'^created_iso:\s*\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z'
    assert re.search(pattern, content, re.MULTILINE), \
        f"No valid created_iso timestamp found\nContent: {content}"


@then(r'the created ticket should have a valid "(?P<field>[^"]+)" timestamp')
def step_created_ticket_has_valid_field_timestamp(context, field):
    """Assert the created ticket has a valid ISO timestamp in the specified field."""
    ticket_id = context.last_created_id
    ticket_path = find_ticket_file(context, ticket_id)
    content = ticket_path.read_text()
    pattern = rf'^{re.escape(field)}:\s*\d{{4}}-\d{{2}}-\d{{2}}T\d{{2}}:\d{{2}}:\d{{2}}Z'
    assert re.search(pattern, content, re.MULTILINE), \
        f"No valid ISO timestamp found in field '{field}'\nContent: {content}"


@then(r'ticket "(?P<ticket_id>[^"]+)" should have field "(?P<field>[^"]+)" with value "(?P<value>[^"]+)"')
def step_ticket_has_field_value(context, ticket_id, field, value):
    """Assert ticket has a field with specific value."""
    ticket_path = find_ticket_file(context, ticket_id)
    content = ticket_path.read_text()

    pattern = rf'^{re.escape(field)}:\s*(.+)$'
    match = re.search(pattern, content, re.MULTILINE)
    assert match, f"Field '{field}' not found in ticket\nContent: {content}"
    actual = match.group(1).strip()
    assert actual == value, f"Field '{field}' has value '{actual}', expected '{value}'"


@then(r'ticket "(?P<ticket_id>[^"]+)" should have "(?P<dep_id>[^"]+)" in deps')
def step_ticket_has_dep(context, ticket_id, dep_id):
    """Assert ticket has a dependency."""
    ticket_path = find_ticket_file(context, ticket_id)
    content = ticket_path.read_text()

    deps_match = re.search(r'^deps:\s*\[([^\]]*)\]', content, re.MULTILINE)
    assert deps_match, f"deps field not found\nContent: {content}"
    deps = deps_match.group(1)
    assert dep_id in deps, f"Dependency '{dep_id}' not in deps: [{deps}]"


@then(r'ticket "(?P<ticket_id>[^"]+)" should not have "(?P<dep_id>[^"]+)" in deps')
def step_ticket_not_has_dep(context, ticket_id, dep_id):
    """Assert ticket does not have a dependency."""
    ticket_path = find_ticket_file(context, ticket_id)
    content = ticket_path.read_text()

    deps_match = re.search(r'^deps:\s*\[([^\]]*)\]', content, re.MULTILINE)
    assert deps_match, f"deps field not found\nContent: {content}"
    deps = deps_match.group(1)
    assert dep_id not in deps, f"Dependency '{dep_id}' should not be in deps: [{deps}]"


@then(r'ticket "(?P<ticket_id>[^"]+)" should have "(?P<link_id>[^"]+)" in links')
def step_ticket_has_link(context, ticket_id, link_id):
    """Assert ticket has a link."""
    ticket_path = find_ticket_file(context, ticket_id)
    content = ticket_path.read_text()

    links_match = re.search(r'^links:\s*\[([^\]]*)\]', content, re.MULTILINE)
    assert links_match, f"links field not found\nContent: {content}"
    links = links_match.group(1)
    assert link_id in links, f"Link '{link_id}' not in links: [{links}]"


@then(r'ticket "(?P<ticket_id>[^"]+)" should not have "(?P<link_id>[^"]+)" in links')
def step_ticket_not_has_link(context, ticket_id, link_id):
    """Assert ticket does not have a link."""
    ticket_path = find_ticket_file(context, ticket_id)
    content = ticket_path.read_text()

    links_match = re.search(r'^links:\s*\[([^\]]*)\]', content, re.MULTILINE)
    assert links_match, f"links field not found\nContent: {content}"
    links = links_match.group(1)
    assert link_id not in links, f"Link '{link_id}' should not be in links: [{links}]"


@then(r'ticket "(?P<ticket_id>[^"]+)" should contain "(?P<text>[^"]+)"')
def step_ticket_contains(context, ticket_id, text):
    """Assert ticket file contains text."""
    ticket_path = find_ticket_file(context, ticket_id)
    content = ticket_path.read_text()
    assert text in content, f"Ticket does not contain '{text}'\nContent: {content}"


@then(r'ticket "(?P<ticket_id>[^"]+)" should contain "(?P<text>[^"]+)" exactly (?P<count>\d+) time(?:s)?')
def step_ticket_contains_count(context, ticket_id, text, count):
    """Assert how OFTEN text occurs -- a second `## Notes` heading is a real bug."""
    ticket_path = find_ticket_file(context, ticket_id)
    content = ticket_path.read_text()
    found = content.count(text)
    assert found == int(count), \
        f"'{text}' occurs {found} time(s), expected {count}\nContent: {content}"


@then(r'ticket "(?P<ticket_id>[^"]+)" should end with the note "(?P<note>[^"]*)"')
def step_ticket_ends_with_note(context, ticket_id, note):
    """Assert the exact bytes `add-note` appends: a bold timestamp, a blank line, the note.

    Anchored at the END of the file, so the blank lines and the trailing newline are pinned
    too -- `should contain` cannot see any of that.
    """
    ticket_path = find_ticket_file(context, ticket_id)
    content = ticket_path.read_text()
    # `\n` in the step text is a real newline, so a multi-line note can be pinned.
    pattern = (r'\n\*\*\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\*\*\n\n'
               + re.escape(note.replace('\\n', '\n')) + r'\n$')
    assert re.search(pattern, content), \
        f"File does not end with the note '{note}'\nContent: {content!r}"


@then(r'ticket "(?P<ticket_id>[^"]+)" should contain a timestamp in notes')
def step_ticket_has_timestamp_in_notes(context, ticket_id):
    """Assert ticket has a timestamp in notes section."""
    ticket_path = find_ticket_file(context, ticket_id)
    content = ticket_path.read_text()

    pattern = r'\*\*\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\*\*'
    assert re.search(pattern, content), \
        f"No timestamp found in notes\nContent: {content}"


@then(r'the output line (?P<line_num>\d+) should contain "(?P<text>[^"]+)"')
def step_output_line_contains(context, line_num, text):
    """Assert specific line of output contains text."""
    line_num = int(line_num)
    lines = context.stdout.split('\n')
    assert len(lines) >= line_num, \
        f"Output has only {len(lines)} lines, expected at least {line_num}"
    line = lines[line_num - 1]
    assert text in line, f"Line {line_num} does not contain '{text}'\nLine: {line}"


@then(r'the output line count should be (?P<count>\d+)')
def step_output_line_count(context, count):
    """Assert output has specific number of lines."""
    count = int(count)
    lines = [l for l in context.stdout.split('\n') if l.strip()]
    assert len(lines) == count, \
        f"Expected {count} lines but got {len(lines)}\nOutput: {context.stdout}"


@then(r'the output should be valid JSONL')
def step_output_valid_jsonl(context):
    """Assert output is valid JSON Lines format."""
    lines = context.stdout.strip().split('\n')
    for line in lines:
        if line.strip():
            try:
                json.loads(line)
            except json.JSONDecodeError as e:
                raise AssertionError(f"Invalid JSONL line: {line}\nError: {e}")


@then(r'the JSONL output should have field "(?P<field>[^"]+)"')
def step_jsonl_has_field(context, field):
    """Assert JSONL output has a specific field."""
    lines = context.stdout.strip().split('\n')
    assert lines, "No JSONL output"

    for line in lines:
        if line.strip():
            data = json.loads(line)
            assert field in data, f"Field '{field}' not found in JSONL\nData: {data}"
            break


@then(r'the JSONL deps field should be a JSON array')
def step_jsonl_deps_is_array(context):
    """Assert deps field in JSONL is an array."""
    lines = context.stdout.strip().split('\n')
    assert lines, "No JSONL output"

    for line in lines:
        if line.strip():
            data = json.loads(line)
            if 'deps' in data:
                assert isinstance(data['deps'], list), \
                    f"deps field is not an array: {type(data['deps'])}"
                return
    raise AssertionError("No JSONL line with deps field found")


@then(r'the dep tree output should have (?P<first_id>[^\s]+) before (?P<second_id>[^\s]+)')
def step_dep_tree_order(context, first_id, second_id):
    """Assert that first_id appears before second_id in dep tree output."""
    output = context.stdout
    lines = output.split('\n')

    first_line = -1
    second_line = -1

    for i, line in enumerate(lines):
        if first_id in line:
            first_line = i
        if second_id in line:
            second_line = i

    assert first_line != -1, f"'{first_id}' not found in output:\n{output}"
    assert second_line != -1, f"'{second_id}' not found in output:\n{output}"
    assert first_line < second_line, \
        f"Expected '{first_id}' (line {first_line + 1}) before '{second_id}' (line {second_line + 1})\nOutput:\n{output}"


@then(r'the output should report exactly (?P<count>\d+) dependency cycles?')
def step_cycle_count(context, count):
    """Assert `dep cycle` reported exactly this many cycles (no bogus, none missed).

    Zero is rejected: empty output would satisfy it, so the no-cycle arm must keep asserting
    the `No dependency cycles found` text instead.
    """
    expected = int(count)
    assert expected > 0, "Use 'the output should be \"No dependency cycles found\"' for zero cycles"
    cycles = parse_reported_cycles(context.stdout)
    assert len(cycles) == expected, \
        f"Expected {expected} cycles but got {len(cycles)}\nOutput:\n{context.stdout}"
    # The headings are numbered 1..N, so a renderer that loses the counter is caught too.
    numbers = [cycle.number for cycle in cycles]
    assert numbers == list(range(1, expected + 1)), \
        f"Expected cycles numbered {list(range(1, expected + 1))} but got {numbers}\nOutput:\n{context.stdout}"


@then(r'the output should report a dependency cycle with members "(?P<members>[^"]+)"')
def step_cycle_with_members(context, members):
    """Assert one of the reported cycles has exactly this comma-separated member set."""
    expected = {member.strip() for member in members.split(',')}
    reported = [cycle.members for cycle in parse_reported_cycles(context.stdout)]
    assert expected in reported, \
        f"No reported cycle has members {sorted(expected)}\nReported: {[sorted(c) for c in reported]}\nOutput:\n{context.stdout}"


@then(r'the output should have "(?P<first>[^"]+)" before "(?P<second>[^"]+)"')
def step_output_order(context, first, second):
    """Assert first text appears before second text in the output."""
    output = context.stdout
    first_pos = output.find(first)
    second_pos = output.find(second)
    assert first_pos != -1, f"'{first}' not found in output:\n{output}"
    assert second_pos != -1, f"'{second}' not found in output:\n{output}"
    assert first_pos < second_pos, \
        f"Expected '{first}' before '{second}'\nOutput:\n{output}"


@then(r'every JSONL line should have field "(?P<field>[^"]+)"')
def step_every_jsonl_line_has_field(context, field):
    """Assert every JSONL line has a specific field."""
    lines = context.stdout.strip().split('\n')
    assert lines and lines[0].strip(), "No JSONL output"

    for line in lines:
        if line.strip():
            data = json.loads(line)
            assert field in data, f"Field '{field}' not found in JSONL line\nData: {data}"


@then(r'ticket "(?P<ticket_id>[^"]+)" should not have field "(?P<field>[^"]+)"')
def step_ticket_should_not_have_field(context, ticket_id, field):
    """Assert ticket does not have a specific field in frontmatter."""
    ticket_path = find_ticket_file(context, ticket_id)
    content = ticket_path.read_text()
    pattern = rf'^{re.escape(field)}:'
    assert not re.search(pattern, content, re.MULTILINE), \
        f"Field '{field}' should not exist in ticket but was found\nContent: {content}"


@then(r'ticket "(?P<ticket_id>[^"]+)" should have a valid "(?P<field>[^"]+)" timestamp')
def step_ticket_has_valid_timestamp(context, ticket_id, field):
    """Assert ticket has a valid ISO timestamp in the specified field."""
    ticket_path = find_ticket_file(context, ticket_id)
    content = ticket_path.read_text()
    pattern = rf'^{re.escape(field)}:\s*\d{{4}}-\d{{2}}-\d{{2}}T\d{{2}}:\d{{2}}:\d{{2}}Z'
    assert re.search(pattern, content, re.MULTILINE), \
        f"No valid ISO timestamp found in field '{field}'\nContent: {content}"


@then(r'a file named "(?P<filename>[^"]+)" should exist in tickets directory')
def step_file_named_exists_in_tickets(context, filename):
    """Assert a specific filename exists in _tickets/ directory."""
    tickets_dir = Path(context.test_dir) / '_tickets'
    file_path = tickets_dir / filename
    assert file_path.exists(), \
        f"File {filename} does not exist in _tickets/\nFiles present: {[f.name for f in tickets_dir.glob('*.md')]}"


@then(r'ticket "(?P<ticket_id>[^"]+)" should be located in subfolder "(?P<subfolder>[^"]+)"')
def step_ticket_located_in_subfolder(context, ticket_id, subfolder):
    """Assert the ticket file still lives in the given subfolder under _tickets/."""
    ticket_path = find_ticket_file(context, ticket_id)
    expected_dir = Path(context.test_dir) / '_tickets' / subfolder
    assert ticket_path.parent == expected_dir, \
        f"Expected ticket '{ticket_id}' in {expected_dir} but found it in {ticket_path.parent}"


# ============================================================================
# Piping and bulk-fixture steps
# ============================================================================

@given(r'(?P<count>\d+) tickets exist')
def step_many_tickets_exist(context, count):
    """Create N minimal tickets, enough output to overflow a pipe buffer.

    Written directly rather than through the CLI: the point is the SIZE of a listing, and
    N create invocations would dominate the scenario's runtime.
    """
    for index in range(int(count)):
        create_ticket(context, f'bulk-{index:05d}', f'Bulk ticket {index:05d}')


@when(r'I run "(?P<command>(?:[^"\\]|\\.)+)" piped into "(?P<reader>[^"]+)"')
def step_run_command_piped_into(context, command, reader):
    """Run a command with `reader` consuming its stdout, and adopt the COMMAND's exit code.

    WHY `bash -o pipefail` and not the default shell: a pipeline's status is its LAST
    command's, so without pipefail every such scenario would assert `head`'s 0 and could
    never see the CLI's broken-pipe code.
    """
    command = command.replace('\\"', '"')
    ticket_script = get_ticket_script(context)
    cmd = command.replace('ticket ', f'{ticket_script} ', 1)

    result = subprocess.run(
        f'set -o pipefail; {cmd} | {reader}',
        shell=True,
        executable='/bin/bash',
        cwd=getattr(context, 'working_dir', context.test_dir),
        capture_output=True,
        text=True,
        stdin=subprocess.DEVNULL,
    )

    context.result = result
    context.stdout = result.stdout.strip()
    context.stderr = result.stderr.strip()
    context.returncode = result.returncode
    context.last_command = command


# ============================================================================
# Launcher (./ticket wrapper) steps
# ============================================================================
#
# WHY an isolated COPY of the tool: these scenarios delete and back-date the BUNDLE, and
# doing that to the developer's own dist/ would break every other scenario and leave the
# working tree without a build. The copy carries the wrapper, the manifests and src/, and
# SYMLINKS node_modules so the on-demand build needs no network.

def _install_manifest():
    """Everything a complete install of the tool needs on disk, from the ONE list that says so.

    Read from pkg/install-manifest.txt rather than repeated here: the read-only-prefix
    install `make package-smoke` replays needs exactly this set, and two hand-maintained
    copies would drift -- silently, since a scenario copying a file that install forgets
    still passes.
    """
    lines = (REPO / 'pkg' / 'install-manifest.txt').read_text().splitlines()
    return [line.strip() for line in lines if line.strip() and not line.startswith('#')]

# A stand-in bundle that announces itself, so a scenario can tell "the wrapper rebuilt" from
# "the wrapper ran what was already there" by looking at stdout alone.
MARKER_BUNDLE_TEXT = 'MARKER BUNDLE'

# Gap between the bundle's mtime and the sources', in seconds. `find -newer` compares
# mtimes, so any gap works; a wide one keeps the intent obvious in a listing.
_MTIME_GAP_SECONDS = 60


def _isolated_tool_copy(context):
    """Materialize a throwaway copy of the tool and point later steps at its wrapper.

    Under `$REPO/.tmp`, NOT the system temp dir: the copy's `ticket` is EXECUTED, and the
    system temp dir is mounted `noexec` in this project's dev container.
    """
    scratch = REPO / '.tmp'
    scratch.mkdir(exist_ok=True)
    root = Path(tempfile.mkdtemp(prefix='ticket_tool_', dir=str(scratch)))
    # Registered BEFORE the copy, so a failure mid-copy is still cleaned up.
    context.tool_dir = root
    context.ticket_script_override = str(root / 'ticket')
    project = Path(context.project_dir)
    # The symlink below is what keeps the copy's build offline -- and it is also a way to
    # write INTO the developer's node_modules if it does not exist yet, since npm would then
    # create it through the dangling link. `make test` builds first so this holds; say so
    # loudly rather than silently mutating the real tree.
    assert (project / 'node_modules').is_dir(), \
        f"[{project / 'node_modules'}] is missing; run `make build` before driving behave directly"
    for name in _install_manifest():
        source = project / name
        if source.is_dir():
            shutil.copytree(source, root / name)
        else:
            shutil.copy2(source, root / name)
    os.symlink(project / 'node_modules', root / 'node_modules')
    return root


def _set_tree_mtime(root, mtime):
    for path in [root, *root.rglob('*')]:
        os.utime(path, (mtime, mtime))


def _write_marker_bundle(root):
    bundle = root / 'dist' / 'ticket.mjs'
    bundle.parent.mkdir(parents=True, exist_ok=True)
    bundle.write_text(f'process.stdout.write("{MARKER_BUNDLE_TEXT}\\n");\n')
    return bundle


@given(r'an isolated copy of the tool with no built bundle')
def step_isolated_tool_without_bundle(context):
    _isolated_tool_copy(context)


@given(r'an isolated copy of the tool whose bundle is older than its sources')
def step_isolated_tool_with_stale_bundle(context):
    root = _isolated_tool_copy(context)
    now = time.time()
    bundle = _write_marker_bundle(root)
    _set_tree_mtime(root / 'src', now)
    os.utime(bundle, (now - _MTIME_GAP_SECONDS, now - _MTIME_GAP_SECONDS))


@given(r'an isolated copy of the tool whose bundle is newer than its sources')
def step_isolated_tool_with_fresh_bundle(context):
    root = _isolated_tool_copy(context)
    now = time.time()
    bundle = _write_marker_bundle(root)
    _set_tree_mtime(root / 'src', now - _MTIME_GAP_SECONDS)
    os.utime(bundle, (now, now))


@given(r'the isolated copy has a source file that cannot be built')
def step_isolated_tool_with_broken_source(context):
    """Make the copy's build fail, without touching anything outside it."""
    (Path(context.tool_dir) / 'src' / 'cli' / 'main.ts').write_text('this is ( not ( typescript\n')


@given(r'the isolated copy has no sources')
def step_isolated_tool_without_sources(context):
    """An install shape the tool does not support: nothing to build from, ever."""
    shutil.rmtree(Path(context.tool_dir) / 'src')


@then(r'the isolated copy should have a built bundle')
def step_isolated_tool_bundle_built(context):
    bundle = Path(context.tool_dir) / 'dist' / 'ticket.mjs'
    assert bundle.is_file(), f"No bundle was built at [{bundle}]"
    text = bundle.read_text()
    assert MARKER_BUNDLE_TEXT not in text, \
        "The bundle is still the marker stand-in; the wrapper did not rebuild it"
