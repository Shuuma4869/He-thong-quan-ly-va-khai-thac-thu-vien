package io.github.shuuma4869.lams.core.inventory.branch.domain;

import java.util.UUID;

public record Branch(UUID id, String code, String name, String status) {}
