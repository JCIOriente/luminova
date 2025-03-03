import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

initializeApp();

const db = getFirestore();

exports.awardPoints = onDocumentWritten('/events/{id}', async (event) => {
  const memberPointsRef = getDocumentReference(event.params.id);

  const currentEventData = event.data.after.data() || {};

  const currentCoDirectorIds = currentEventData.coDirectorIds || [];
  const currentCollaboratorIds = currentEventData.collaboratorIds || [];
  const currentAssistantIds = currentEventData.assistantIds || [];

  const memberPointsSnapshot = await memberPointsRef.get();
  const dbOperation = memberPointsSnapshot.exists ? 'update' : 'set';
  const resDoc = await memberPointsRef[dbOperation]({
    director: currentEventData.directorId,
    name: currentEventData.name,
    coDirectorIds: currentCoDirectorIds,
    collaboratorIds: currentCollaboratorIds,
    assistantIds: currentAssistantIds,
    points: await calculatePointsPerRole(currentEventData.type, {
      directorId: currentEventData.directorId,
      currentCoDirectorIds,
      currentCollaboratorIds,
      currentAssistantIds,
    }),
  });

  console.log(
    "Document operation '%s' executed at time: %s",
    dbOperation,
    resDoc.writeTime.toDate(),
  );
});

function getDocumentReference(eventId: string) {
  const date = new Date();
  return db
    .collection('memberPoints')
    .doc(date.getFullYear() + '')
    .collection(date.getMonth() + 1 + '')
    .doc(eventId);
}

async function calculatePointsPerRole(
  eventType: string,
  {
    directorId,
    currentCoDirectorIds,
    currentCollaboratorIds,
    currentAssistantIds,
  },
) {
  const eventPoints = await getEventPoints(eventType);

  const directorPoints = getPointsPerRole(eventPoints, 'Director', [
    directorId,
  ]);
  const coDirectorPoints = getPointsPerRole(
    eventPoints,
    'CoDirector',
    currentCoDirectorIds,
  );
  const collaboratorPoints = getPointsPerRole(
    eventPoints,
    'Collaborator',
    currentCollaboratorIds,
  );
  const assistantPoints = getPointsPerRole(
    eventPoints,
    'Assistant',
    currentAssistantIds,
  );

  const membersData = [
    ...directorPoints,
    ...coDirectorPoints,
    ...collaboratorPoints,
    ...assistantPoints,
  ];

  const points = {};

  for (const memberData of membersData) {
    if (!points[memberData.id]) {
      points[memberData.id] = 0;
    }

    points[memberData.id] += memberData.points;
  }

  return points;
}

async function getEventPoints(eventType: string) {
  const snapshot = await db.collection('pointRules').get();
  if (snapshot.empty) return null;

  const pointRules = snapshot.docs.map((doc) => ({
    ...doc.data(),
  }));

  const eventPointRules = pointRules.filter(
    (pointRule) => pointRule.type === eventType,
  );

  return eventPointRules;
}

function getPointsPerRole(eventPoints, role: string, memberIds: string[]) {
  const eventPoint = eventPoints.find((points) => points.role === role);
  const points = Number(eventPoint?.points) || 0;

  return memberIds.map((memberId) => ({
    id: memberId,
    points,
  }));
}
