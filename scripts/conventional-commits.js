const pattern =
    /^(?:(?:fixup|squash|amend)! )?(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(?:\([a-zA-Z0-9._/-]+\))?!?:\s+\S.*$/;

export function isConventionalCommit(subject) {
    return pattern.test(subject.trim());
}
