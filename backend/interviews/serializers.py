from rest_framework import serializers
from .models import Session, Event, EmotionSnapshot


class EventSerializer(serializers.ModelSerializer):
    class Meta:
        model = Event
        fields = ['id', 'event_type', 'severity', 'message', 
                  'timestamp', 'metadata']


class EmotionSnapshotSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmotionSnapshot
        fields = '__all__'


class SessionSerializer(serializers.ModelSerializer):
    events = EventSerializer(many=True, read_only=True)

    class Meta:
        model = Session
        fields = '__all__'


class SessionListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Session
        fields = ['id', 'candidate_name', 'candidate_email', 
                  'job_role', 'status', 'overall_score', 
                  'started_at', 'verdict']


class StartSessionSerializer(serializers.Serializer):
    candidate_name = serializers.CharField(required=False, default='')
    candidate_email = serializers.CharField(required=False, default='')
    job_role = serializers.CharField(required=False, default='')


class LogEventSerializer(serializers.Serializer):
    event_type = serializers.CharField()
    severity = serializers.CharField()
    message = serializers.CharField()
    metadata = serializers.DictField(required=False, default=dict)


class EndSessionSerializer(serializers.Serializer):
    duration_seconds = serializers.IntegerField()
    attention_score = serializers.FloatField()
    integrity_score = serializers.FloatField()
    engagement_score = serializers.FloatField()
    confidence_score = serializers.FloatField()
    overall_score = serializers.FloatField()
    tab_switch_count = serializers.IntegerField()
    face_absent_count = serializers.IntegerField()
    multi_face_count = serializers.IntegerField()
    look_away_count = serializers.IntegerField()
    audio_anomaly_count = serializers.IntegerField(required=False, default=0)