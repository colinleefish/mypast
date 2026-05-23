package model

import "time"

type Memory struct {
	URI              string    `gorm:"column:uri;type:text;primaryKey"`
	Category         string    `gorm:"column:category;type:text;not null;index"`
	Slug             *string   `gorm:"column:slug;type:text"`
	Abstract         *string   `gorm:"column:abstract;type:text"`
	Body             *string   `gorm:"column:body;type:text"`
	SourceSceneURIs  []string  `gorm:"column:source_scene_uris;type:text[];not null"`
	CreatedAt        time.Time `gorm:"column:created_at;type:timestamptz;not null"`
	UpdatedAt        time.Time `gorm:"column:updated_at;type:timestamptz;not null"`
}

func (Memory) TableName() string { return "memories" }
