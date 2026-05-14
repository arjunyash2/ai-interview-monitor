from django.db import models
import uuid

class Session(models.Model):
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('completed', 'Completed'),
        ('flagged', 'Flagged'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    candidate_name = models.CharField(max_length=100, blank=True)
    candidate_email = models.CharField(max_length=200, blank=True)
    job_role = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    duration_seconds = models.IntegerField(default=0)

    # Scores
    attention_score = models.FloatField(default=100)
    integrity_score = models.FloatField(default=100)
    engagement_score = models.FloatField(default=100)
    confidence_score = models.FloatField(default=100)
    overall_score = models.FloatField(default=100)

    # Counts
    tab_switch_count = models.IntegerField(default=0)
    face_absent_count = models.IntegerField(default=0)
    multi_face_count = models.IntegerField(default=0)
    look_away_count = models.IntegerField(default=0)
    audio_anomaly_count = models.IntegerField(default=0)

    # Verdict
    verdict = models.CharField(max_length=50, blank=True)
    verdict_detail = models.TextField(blank=True)

    class Meta:
        ordering = ['-started_at']

    def __str__(self):
        return f"Session {self.id} - {self.candidate_name or 'Unknown'}"


class Event(models.Model):
    SEVERITY_CHOICES = [
        ('info', 'Info'),
        ('warning', 'Warning'),
        ('danger', 'Danger'),
    ]

    TYPE_CHOICES = [
        ('tab_switch', 'Tab Switch'),
        ('face_absent', 'Face Absent'),
        ('multi_face', 'Multiple Faces'),
        ('gaze_away', 'Gaze Away'),
        ('audio_spike', 'Audio Spike'),
        ('background_motion', 'Background Motion'),
        ('looking_down', 'Looking Down'),
        ('head_turned', 'Head Turned'),
        ('system', 'System'),
        ('other', 'Other'),
    ]

    session = models.ForeignKey(Session, on_delete=models.CASCADE, related_name='events')
    event_type = models.CharField(max_length=50, choices=TYPE_CHOICES)
    severity = models.CharField(max_length=20, choices=SEVERITY_CHOICES, default='info')
    message = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['timestamp']

    def __str__(self):
        return f"{self.event_type} - {self.session.id}"


class EmotionSnapshot(models.Model):
    session = models.ForeignKey(Session, on_delete=models.CASCADE, related_name='emotion_snapshots')
    timestamp = models.DateTimeField(auto_now_add=True)

    # Emotions
    happy = models.FloatField(default=0)
    neutral = models.FloatField(default=0)
    confused = models.FloatField(default=0)
    focused = models.FloatField(default=0)
    nervous = models.FloatField(default=0)
    engaged = models.FloatField(default=0)
    disengaged = models.FloatField(default=0)
    suspicious = models.FloatField(default=0)
    dominant = models.CharField(max_length=50, default='neutral')

    # Gaze
    gaze_direction = models.CharField(max_length=50, default='center')
    looking_at_camera = models.BooleanField(default=True)
    gaze_x = models.FloatField(default=0.5)
    gaze_y = models.FloatField(default=0.5)

    # Head pose
    head_yaw = models.FloatField(default=0.5)
    head_pitch = models.FloatField(default=0.45)
    head_roll = models.FloatField(default=0)

    class Meta:
        ordering = ['timestamp']