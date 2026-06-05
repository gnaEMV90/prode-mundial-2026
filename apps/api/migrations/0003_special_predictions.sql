CREATE TABLE IF NOT EXISTS special_predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  champion_team_id INTEGER NOT NULL,
  runner_up_team_id INTEGER NOT NULL,
  third_place_team_id INTEGER NOT NULL,
  fourth_place_team_id INTEGER NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  locked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (champion_team_id) REFERENCES teams(id),
  FOREIGN KEY (runner_up_team_id) REFERENCES teams(id),
  FOREIGN KEY (third_place_team_id) REFERENCES teams(id),
  FOREIGN KEY (fourth_place_team_id) REFERENCES teams(id)
);

CREATE TABLE IF NOT EXISTS tournament_results (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  champion_team_id INTEGER,
  runner_up_team_id INTEGER,
  third_place_team_id INTEGER,
  fourth_place_team_id INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (champion_team_id) REFERENCES teams(id),
  FOREIGN KEY (runner_up_team_id) REFERENCES teams(id),
  FOREIGN KEY (third_place_team_id) REFERENCES teams(id),
  FOREIGN KEY (fourth_place_team_id) REFERENCES teams(id)
);

INSERT INTO tournament_results (id) VALUES (1)
ON CONFLICT(id) DO NOTHING;

INSERT INTO app_settings (key, value)
VALUES ('SPECIAL_PREDICTIONS_LOCKED', 'false')
ON CONFLICT(key) DO NOTHING;
