package model

import (
	"time"

	"github.com/google/uuid"
)

type Task struct {
	ID         uuid.UUID  `gorm:"column:id;type:uuid;primaryKey"`
	Kind       string     `gorm:"column:kind;type:text;not null"`
	Status     string     `gorm:"column:status;type:text;not null;default:pending"`
	Progress   int        `gorm:"column:progress;not null;default:0"`
	ResultURI  *string    `gorm:"column:result_uri;type:text"`
	Error      *string    `gorm:"column:error;type:text"`
	SessionID  *uuid.UUID `gorm:"column:session_id;type:uuid;index"`
	CreatedAt  time.Time  `gorm:"column:created_at;type:timestamptz;not null"`
	UpdatedAt  time.Time  `gorm:"column:updated_at;type:timestamptz;not null"`
}

func (Task) TableName() string { return "tasks" }
