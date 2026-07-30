"""Behave environment setup for ticket CLI tests."""

import os
import shutil
import subprocess
import tempfile
from pathlib import Path


def _git_init(path):
    """Initialize a git repository at path (tickets are anchored to the repo root)."""
    subprocess.run(
        ['git', 'init', '-q'],
        cwd=str(path),
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def before_all(context):
    """Set up test environment before all tests."""
    # Store the project directory (where the ticket script lives)
    context.project_dir = Path(__file__).parent.parent.resolve()


def before_scenario(context, scenario):
    """Create a fresh temporary directory for each scenario."""
    # Create a temporary directory for this scenario, initialized as a git repo
    # so that `git rev-parse --show-toplevel` resolves it as the tickets root.
    context.test_dir = tempfile.mkdtemp(prefix='ticket_test_')
    _git_init(context.test_dir)

    # No isolated copy of the tool unless the scenario asks for one: every other scenario
    # drives the checkout's own ./ticket.
    context.tool_dir = None
    context.ticket_script_override = None

    # Initialize tracking
    context.tickets = {}
    context.last_created_id = None
    context.stdout = ''
    context.stderr = ''
    context.returncode = None


def after_scenario(context, scenario):
    """Clean up temporary directories after each scenario."""
    if hasattr(context, 'test_dir') and os.path.exists(context.test_dir):
        _restore_directory_permissions(context.test_dir)
        shutil.rmtree(context.test_dir)
    # rmtree unlinks the node_modules SYMLINK without descending into the real one.
    tool_dir = getattr(context, 'tool_dir', None)
    if tool_dir and os.path.exists(tool_dir):
        shutil.rmtree(tool_dir)


def _restore_directory_permissions(root):
    """Make every directory writable again.

    A scenario may drop write permission to exercise an unwritable tickets directory,
    and rmtree cannot unlink out of one.
    """
    for directory, _subdirs, _files in os.walk(root):
        os.chmod(directory, 0o755)


def before_feature(context, feature):
    """Called before each feature file is processed."""
    pass


def after_feature(context, feature):
    """Called after each feature file is processed."""
    pass
