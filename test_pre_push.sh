#!/usr/bin/env bash
# __enable_bash_strict_mode__

main() {
  cdi.caller_dir
  ./test.sh
}

main "${@}"
