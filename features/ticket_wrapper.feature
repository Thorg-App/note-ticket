Feature: The launcher builds the TypeScript bundle on demand
  A checkout install is build-from-source: there is no committed bundle, so `./ticket`
  (symlinked onto PATH under that name) has to produce a current one by itself. It must do that without ever letting
  build output reach stdout, and it must not rebuild when the bundle is already current.

  Scenario: A missing bundle is built on the first invocation
    Given an isolated copy of the tool with no built bundle
    And a ticket exists with ID "wrap-0001" and title "Built on demand"
    When I run "ticket ls"
    Then the command should succeed
    And the isolated copy should have a built bundle
    # Exactly the one ls row: build chatter on stdout would add lines here.
    And the output line count should be 1
    And the output should contain "wrap-0001"
    And stderr should contain "building"

  Scenario: A bundle older than the sources is rebuilt
    Given an isolated copy of the tool whose bundle is older than its sources
    When I run "ticket help"
    Then the command should succeed
    And the output should not contain "MARKER BUNDLE"
    And the output should contain "Usage:"
    And the isolated copy should have a built bundle

  Scenario: A bundle newer than the sources is run as it is
    Given an isolated copy of the tool whose bundle is newer than its sources
    When I run "ticket help"
    Then the command should succeed
    And the output should be "MARKER BUNDLE"

  # Never a partial or garbled run: without node there is nothing to hand the invocation to.
  Scenario: A missing node is reported, and nothing reaches stdout
    When I run "ticket help" with node missing from PATH
    Then the command should fail
    And stderr should contain "node is required but is not on PATH"
    And the output should be empty

  Scenario: A missing npm is reported when a build is needed
    Given an isolated copy of the tool with no built bundle
    When I run "ticket help" with npm missing from PATH
    Then the command should fail
    And stderr should contain "npm is required but is not on PATH"
    And the output should be empty

  # A failed build must not fall back to the bundle it decided was stale: the marker would
  # appear on stdout if it did.
  Scenario: A failed build is reported and the stale bundle is not run
    Given an isolated copy of the tool whose bundle is older than its sources
    And the isolated copy has a source file that cannot be built
    When I run "ticket help"
    Then the command should fail
    And stderr should contain "failed to build"
    And the output should be empty

  # Build-from-source means src/ is part of the install. A tree without it cannot be kept
  # current, so it is reported rather than silently serving whatever dist/ holds.
  Scenario: A copy without sources is reported, not silently served
    Given an isolated copy of the tool whose bundle is newer than its sources
    And the isolated copy has no sources
    When I run "ticket help"
    Then the command should fail
    And stderr should contain "this is not a complete install"
    And the output should be empty
