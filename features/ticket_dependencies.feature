Feature: Ticket Dependencies
  As a user
  I want to manage ticket dependencies
  So that I can track blocking relationships

  Background:
    Given a clean tickets directory
    And a ticket exists with ID "task-0001" and title "Main task"
    And a ticket exists with ID "task-0002" and title "Dependency task"
    And a ticket exists with ID "task-0003" and title "Another task"

  Scenario: Add a dependency
    When I run "ticket dep task-0001 task-0002"
    Then the command should succeed
    And the output should be "Added dependency: task-0001 -> task-0002"
    And ticket "task-0001" should have "task-0002" in deps

  Scenario: Add dependency is idempotent
    Given ticket "task-0001" depends on "task-0002"
    When I run "ticket dep task-0001 task-0002"
    Then the command should succeed
    And the output should be "Dependency already exists"

  Scenario: Remove a dependency
    Given ticket "task-0001" depends on "task-0002"
    When I run "ticket undep task-0001 task-0002"
    Then the command should succeed
    And the output should be "Removed dependency: task-0001 -/-> task-0002"
    And ticket "task-0001" should not have "task-0002" in deps

  Scenario: Remove non-existent dependency
    When I run "ticket undep task-0001 task-0002"
    Then the command should fail
    And the output should be "Dependency not found"

  Scenario: Add dependency with non-existent ticket
    When I run "ticket dep task-0001 nonexistent"
    Then the command should fail
    And the output should contain "Error: ticket 'nonexistent' not found"

  Scenario: Add dependency to non-existent ticket
    When I run "ticket dep nonexistent task-0001"
    Then the command should fail
    And the output should contain "Error: ticket 'nonexistent' not found"

  # Ids are matched as whole array ELEMENTS. The bash implementation asked `grep` of the raw
  # `deps:` text, so an id that merely occurred inside another one counted as present and a
  # removal cut it out of the middle of its neighbour.
  Scenario: A dependency id that only occurs inside a recorded id is still added
    Given a ticket exists with ID "sub-1" and title "Sub one"
    And a ticket exists with ID "sub-11" and title "Sub eleven"
    And ticket "task-0001" depends on "sub-11"
    When I run "ticket dep task-0001 sub-1"
    Then the command should succeed
    And the output should be "Added dependency: task-0001 -> sub-1"
    And ticket "task-0001" should have field "deps" with value "[sub-11, sub-1]"

  Scenario: Removing a dependency leaves a sibling id that contains it intact
    Given a ticket exists with ID "sub-1" and title "Sub one"
    And a ticket exists with ID "sub-11" and title "Sub eleven"
    And ticket "task-0001" depends on "sub-1"
    And ticket "task-0001" depends on "sub-11"
    When I run "ticket undep task-0001 sub-1"
    Then the command should succeed
    And ticket "task-0001" should have field "deps" with value "[sub-11]"

  Scenario: Adding a dependency to a ticket with no deps field creates the array
    Given a raw ticket file "bare.md" exists with content
      """
      ---
      id: bare-0001
      title: "Bare ticket"
      status: open
      ---

      Body.
      """
    When I run "ticket dep bare-0001 task-0002"
    Then the command should succeed
    And the output should be "Added dependency: bare-0001 -> task-0002"
    And ticket "bare-0001" should have field "deps" with value "[task-0002]"

  Scenario: Removing a dependency from a ticket with no deps field reports it as missing
    Given a raw ticket file "bare.md" exists with content
      """
      ---
      id: bare-0001
      title: "Bare ticket"
      status: open
      ---

      Body.
      """
    When I run "ticket undep bare-0001 task-0002"
    Then the command should fail
    And the output should be "Dependency not found"

  Scenario: View dependency tree
    Given ticket "task-0001" depends on "task-0002"
    And ticket "task-0002" depends on "task-0003"
    When I run "ticket dep tree task-0001"
    Then the command should succeed
    And the output should contain "task-0001"
    And the output should contain "task-0002"
    And the output should contain "task-0003"

  Scenario: Dependency tree shows status and title
    Given ticket "task-0001" depends on "task-0002"
    When I run "ticket dep tree task-0001"
    Then the command should succeed
    And the output should contain "[open]"
    And the output should contain "Main task"
    And the output should contain "Dependency task"

  Scenario: Dependency tree uses box-drawing characters
    Given ticket "task-0001" depends on "task-0002"
    When I run "ticket dep tree task-0001"
    Then the command should succeed
    And the output should match box-drawing tree format

  Scenario: Dependency tree with multiple children
    Given ticket "task-0001" depends on "task-0002"
    And ticket "task-0001" depends on "task-0003"
    When I run "ticket dep tree task-0001"
    Then the command should succeed
    And the output should contain "task-0002"
    And the output should contain "task-0003"

  Scenario: Dependency tree handles cycles gracefully
    Given ticket "task-0001" depends on "task-0002"
    And ticket "task-0002" depends on "task-0001"
    When I run "ticket dep tree task-0001"
    Then the command should succeed
    And the output should contain "task-0001"
    And the output should contain "task-0002"

  Scenario: Full dependency tree shows all occurrences
    Given ticket "task-0001" depends on "task-0002"
    And ticket "task-0001" depends on "task-0003"
    And ticket "task-0002" depends on "task-0003"
    When I run "ticket dep tree --full task-0001"
    Then the command should succeed

  Scenario: Dependency tree children sorted by subtree depth then ID
    Given a ticket exists with ID "task-0001" and title "Root"
    And a ticket exists with ID "task-0002" and title "Child B shallow"
    And a ticket exists with ID "task-0003" and title "Child A shallow"
    And a ticket exists with ID "task-0004" and title "Child C deep"
    And a ticket exists with ID "task-0005" and title "Grandchild"
    And ticket "task-0001" depends on "task-0002"
    And ticket "task-0001" depends on "task-0003"
    And ticket "task-0001" depends on "task-0004"
    And ticket "task-0004" depends on "task-0005"
    When I run "ticket dep tree task-0001"
    Then the command should succeed
    And the dep tree output should have task-0002 before task-0003
    And the dep tree output should have task-0003 before task-0004
    And the dep tree output should have task-0002 before task-0004

  Scenario: Dependency tree children sorted by ID when same depth
    Given a ticket exists with ID "task-0001" and title "Root"
    And a ticket exists with ID "task-0005" and title "Child E"
    And a ticket exists with ID "task-0002" and title "Child B"
    And a ticket exists with ID "task-0004" and title "Child D"
    And a ticket exists with ID "task-0003" and title "Child C"
    And ticket "task-0001" depends on "task-0005"
    And ticket "task-0001" depends on "task-0002"
    And ticket "task-0001" depends on "task-0004"
    And ticket "task-0001" depends on "task-0003"
    When I run "ticket dep tree task-0001"
    Then the command should succeed
    And the dep tree output should have task-0002 before task-0003
    And the dep tree output should have task-0003 before task-0004
    And the dep tree output should have task-0004 before task-0005

  Scenario: Dependency tree complex multi-level sorting
    Given a ticket exists with ID "task-0001" and title "Root"
    And a ticket exists with ID "task-0010" and title "Shallow C"
    And a ticket exists with ID "task-0005" and title "Shallow A"
    And a ticket exists with ID "task-0008" and title "Shallow B"
    And a ticket exists with ID "task-0020" and title "Deep B"
    And a ticket exists with ID "task-0015" and title "Deep A"
    And a ticket exists with ID "task-0025" and title "Deepest"
    And ticket "task-0001" depends on "task-0010"
    And ticket "task-0001" depends on "task-0005"
    And ticket "task-0001" depends on "task-0008"
    And ticket "task-0001" depends on "task-0020"
    And ticket "task-0001" depends on "task-0015"
    And ticket "task-0020" depends on "task-0025"
    And ticket "task-0015" depends on "task-0025"
    When I run "ticket dep tree task-0001"
    Then the command should succeed
    And the dep tree output should have task-0005 before task-0008
    And the dep tree output should have task-0008 before task-0010
    And the dep tree output should have task-0010 before task-0015
    And the dep tree output should have task-0010 before task-0020
    And the dep tree output should have task-0015 before task-0020

  Scenario: Cycle detection reports nothing for an acyclic graph
    Given ticket "task-0001" depends on "task-0002"
    When I run "ticket dep cycle"
    Then the command should succeed
    And the output should be "No dependency cycles found"

  Scenario: Cycle detection finds a two-ticket cycle
    Given ticket "task-0001" depends on "task-0002"
    And ticket "task-0002" depends on "task-0001"
    When I run "ticket dep cycle"
    Then the command should succeed
    And the output should contain "Cycle 1:"
    And the output should contain "task-0001 [open] Main task"
    And the output should contain "task-0002 [open] Dependency task"

  # A ticket that merely POINTS INTO a cycle is not part of one. The bash implementation
  # aborted its DFS at the first cycle and left the nodes it had entered marked "visiting",
  # so a later traversal through an in-pointer reported it as a second, non-existent cycle.
  #
  # WHY TWO in-pointers (task-0001 and task-0004): with a single one, whether the buggy
  # algorithm walks into a node left "visiting" depends on which ticket file is enumerated
  # first — so an unrelated rename of a Background title could quietly turn this scenario into
  # one that passes against the bug. With one in-pointer at each end of the cycle, EVERY
  # enumeration order leaves an in-pointer to be entered after the abort (verified by mutation
  # over all 24 orderings).
  Scenario: Cycle detection does not report a ticket that only points into a cycle
    Given a ticket exists with ID "task-0004" and title "Fourth task"
    And ticket "task-0001" depends on "task-0002"
    And ticket "task-0002" depends on "task-0003"
    And ticket "task-0003" depends on "task-0002"
    And ticket "task-0004" depends on "task-0003"
    When I run "ticket dep cycle"
    Then the command should succeed
    And the output should report exactly 1 dependency cycle
    And the output should report a dependency cycle with members "task-0002, task-0003"
    And the output should not contain "task-0001"
    And the output should not contain "task-0004"

  # Three cycles sharing task-0002. bash MISSED cycles here: the first cycle aborted the DFS,
  # so task-0002's remaining back edges were never walked.
  #
  # WHY THREE overlapping cycles rather than two: with two, the abort still happens to leave
  # the right answer behind for some enumeration orders. Three make the buggy algorithm wrong
  # in every order — either a cycle is missing or a member set is polluted by the stack it
  # failed to unwind (verified by mutation over all 24 orderings).
  Scenario: Cycle detection finds every cycle overlapping in one ticket
    Given a ticket exists with ID "task-0004" and title "Fourth task"
    And ticket "task-0001" depends on "task-0002"
    And ticket "task-0002" depends on "task-0001"
    And ticket "task-0002" depends on "task-0003"
    And ticket "task-0003" depends on "task-0002"
    And ticket "task-0002" depends on "task-0004"
    And ticket "task-0004" depends on "task-0002"
    When I run "ticket dep cycle"
    Then the command should succeed
    And the output should report exactly 3 dependency cycles
    And the output should report a dependency cycle with members "task-0001, task-0002"
    And the output should report a dependency cycle with members "task-0002, task-0003"
    And the output should report a dependency cycle with members "task-0002, task-0004"

  Scenario: Cycle detection ignores closed tickets
    Given ticket "task-0001" depends on "task-0002"
    And ticket "task-0002" depends on "task-0001"
    And ticket "task-0002" has status "closed"
    When I run "ticket dep cycle"
    Then the command should succeed
    And the output should be "No dependency cycles found"
