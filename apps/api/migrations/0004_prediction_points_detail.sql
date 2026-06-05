ALTER TABLE predictions ADD COLUMN exact_score_points INTEGER NOT NULL DEFAULT 0;
ALTER TABLE predictions ADD COLUMN correct_winner_points INTEGER NOT NULL DEFAULT 0;
ALTER TABLE predictions ADD COLUMN correct_draw_points INTEGER NOT NULL DEFAULT 0;
ALTER TABLE predictions ADD COLUMN goal_difference_points INTEGER NOT NULL DEFAULT 0;
ALTER TABLE predictions ADD COLUMN points_reason TEXT NOT NULL DEFAULT 'Pendiente';
