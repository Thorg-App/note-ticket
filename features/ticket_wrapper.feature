Feature: The launcher builds the TypeScript bundle on demand
  Distribution is build-from-source: there is no committed bundle, so `./ticket` (installed
  as `tk`) has to produce a current one by itself. It must do that without ever letting
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
