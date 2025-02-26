// Copyright 2023 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

const styles = `
.timeline-save-dialog {
  padding: 20px;
  min-width: 300px;
}

.save-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.save-dialog-checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.save-dialog-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}

.save-dialog-buttons button {
  padding: 6px 12px;
  border-radius: 4px;
  border: 1px solid var(--color-details-hairline);
  background-color: var(--color-background);
  color: var(--color-text-primary);
  cursor: pointer;
}

.save-dialog-buttons button:hover {
  background-color: var(--color-background-elevation-1);
}

.save-dialog-buttons button.primary-button {
  background-color: var(--color-primary);
  color: var(--color-background);
  border-color: var(--color-primary);
}

.save-dialog-buttons button.primary-button:hover {
  background-color: var(--color-primary-variant);
}
`;

export default styles;