package handler

import (
	"errors"
	"net/http"

	"github.com/colinleefish/mypast/internal/service/browse"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type BrowseHandler struct {
	svc *browse.Service
}

func NewBrowseHandler(svc *browse.Service) *BrowseHandler {
	return &BrowseHandler{svc: svc}
}

func (h *BrowseHandler) Overview(c *gin.Context) {
	out, err := h.svc.Overview(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *BrowseHandler) ListSessions(c *gin.Context) {
	rows, err := h.svc.ListSessions(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": rows})
}

func (h *BrowseHandler) GetSession(c *gin.Context) {
	key := c.Param("session_key")
	detail, err := h.svc.GetSession(c.Request.Context(), key)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, detail)
}

func (h *BrowseHandler) ListAtoms(c *gin.Context) {
	rows, err := h.svc.ListAtoms(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": rows})
}

func (h *BrowseHandler) ListScenes(c *gin.Context) {
	rows, err := h.svc.ListScenes(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": rows})
}

func (h *BrowseHandler) ListMemories(c *gin.Context) {
	rows, err := h.svc.ListMemories(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": rows})
}

func (h *BrowseHandler) ListPipelineStates(c *gin.Context) {
	rows, err := h.svc.ListPipelineStates(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": rows})
}

func (h *BrowseHandler) ListTasks(c *gin.Context) {
	rows, err := h.svc.ListTasks(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": rows})
}
