import { initializeApp } from 'firebase-admin/app';
import { DocumentReference, getFirestore } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

initializeApp();
const db = getFirestore();

exports.awardPoints = onDocumentWritten('/events/{id}', async (event) => {
  const memberPointsRef = getMemberPointsReference(event.params.id);
  const eventData = extractEventData(event);

  const memberPointsSnapshot = await memberPointsRef.get();
  const operationType = memberPointsSnapshot.exists ? 'update' : 'set';

  try {
    const updatedDoc = await memberPointsRef[operationType]({
      director: eventData.directorId,
      name: eventData.name,
      coDirectorIds: eventData.coDirectorIds,
      collaboratorIds: eventData.collaboratorIds,
      participantIds: eventData.participantIds,
      points: await calculatePointsForRoles(eventData),
    });

    console.log(
      `Document operation '%s' executed at time: %s`,
      operationType,
      updatedDoc.writeTime.toDate(),
    );
  } catch (error) {
    console.error('Error updating member points:', error);
  }
});

function getMemberPointsReference(eventId: string): DocumentReference {
  const currentDate = new Date();
  return db
    .collection('memberPoints')
    .doc(currentDate.getFullYear().toString())
    .collection((currentDate.getMonth() + 1).toString())
    .doc(eventId);
}

function extractEventData(event) {
  const eventData = event.data.after.data() || {};
  return {
    directorId: eventData.directorId,
    name: eventData.name,
    coDirectorIds: eventData.coDirectorIds || [],
    collaboratorIds: eventData.collaboratorIds || [],
    participantIds: eventData.participantIds || [],
    type: eventData.type,
  };
}

async function calculatePointsForRoles(eventData) {
  const eventPoints = await fetchEventPoints(eventData.type);

  const directorPoints = calculateRolePoints(eventPoints, 'Director', [
    eventData.directorId,
  ]);
  const coDirectorPoints = calculateRolePoints(
    eventPoints,
    'CoDirector',
    eventData.coDirectorIds,
  );
  const collaboratorPoints = calculateRolePoints(
    eventPoints,
    'Collaborator',
    eventData.collaboratorIds,
  );
  const participantPoints = calculateRolePoints(
    eventPoints,
    'Participant',
    eventData.participantIds,
  );

  return aggregatePoints([
    ...directorPoints,
    ...coDirectorPoints,
    ...collaboratorPoints,
    ...participantPoints,
  ]);
}

async function fetchEventPoints(eventType: string): Promise<Array<unknown>> {
  const snapshot = await db.collection('pointRules').get();
  if (snapshot.empty) return [];

  return snapshot.docs
    .map((doc) => doc.data())
    .filter((rule) => rule.type === eventType);
}

function calculateRolePoints(eventPoints, role: string, memberIds: string[]) {
  const rolePoints =
    eventPoints.find((rule) => rule.role === role)?.points || 0;

  return memberIds.map((memberId) => ({
    id: memberId,
    points: Number(rolePoints),
  }));
}

function aggregatePoints(membersData) {
  return membersData.reduce((points, memberData) => {
    points[memberData.id] = (points[memberData.id] || 0) + memberData.points;
    return points;
  }, {});
}
